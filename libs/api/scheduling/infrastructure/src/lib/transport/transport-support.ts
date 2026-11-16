import { setTimeout } from 'node:timers/promises';
import type { PrismaService } from '@trame/api/database';
import type { AmqpSession } from '@trame/platform/messaging';

export interface DatabaseRecoveryOptions {
  prisma: PrismaService;
  session: AmqpSession;
  signal?: AbortSignal;
  logError: (errorType: string) => void;
}

/**
 * Valide une écriture, en attendant PostgreSQL s'il est indisponible : l'indisponibilité d'une
 * dépendance ne consomme pas les reprises du traitement. Toute autre erreur remonte.
 */
export class DatabaseRecovery {
  constructor(private readonly options: DatabaseRecoveryOptions) {}

  async commit(write: () => Promise<void>): Promise<void> {
    while (this.options.session.isOpen && !this.options.signal?.aborted) {
      try {
        await write();
        return;
      } catch (error) {
        if (await this.databaseIsAvailable()) {
          throw error;
        }
        this.options.logError('DatabaseUnavailable');
        await setTimeout(1_000, undefined, { signal: this.options.signal });
      }
    }
    throw new Error('Transport arrêté avant validation.');
  }

  private async databaseIsAvailable(): Promise<boolean> {
    try {
      await this.options.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

/** Corps JSON d'un message, refusé au-delà de sa taille maximale. */
export function parseJsonBody(body: Buffer, maxBytes: number): unknown {
  if (body.length > maxBytes) {
    throw new SyntaxError('Message trop volumineux.');
  }
  return JSON.parse(body.toString('utf8')) as unknown;
}

export function errorTypeOf(error: unknown): string {
  return error instanceof Error ? error.constructor.name : 'UnknownError';
}
