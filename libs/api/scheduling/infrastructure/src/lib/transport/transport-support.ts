import { setTimeout } from 'node:timers/promises';
import type { PrismaService } from '@trame/api/database';
import type { Clock } from '@trame/platform/clock';
import { type AmqpSession, PublicationNotConfirmedError } from '@trame/platform/messaging';

const REFUSED_PUBLICATION_PAUSE_SECONDS = 5;

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

/**
 * Une file pleine refuse la publication (`x-overflow: reject-publish`) sans fermer la session. Le
 * flux concerné attend 5 s avant de réessayer ; l'autre flux et les consommateurs continuent.
 * Une session fermée ou une autre erreur remonte : la boucle du relais reconnecte.
 */
export class RefusedPublicationPause {
  private resumeAt: Temporal.Instant | undefined;

  constructor(
    private readonly clock: Clock,
    private readonly session: Pick<AmqpSession, 'isOpen'>,
    private readonly logError: (errorType: string) => void,
  ) {}

  async relay(deliver: () => Promise<void>): Promise<void> {
    if (this.isPaused()) {
      return;
    }
    try {
      await deliver();
      this.resumeAt = undefined;
    } catch (error) {
      if (!(error instanceof PublicationNotConfirmedError) || !this.session.isOpen) {
        throw error;
      }
      this.logError('PublicationRefused');
      this.resumeAt = this.clock.now().add({ seconds: REFUSED_PUBLICATION_PAUSE_SECONDS });
    }
  }

  private isPaused(): boolean {
    if (this.resumeAt === undefined) {
      return false;
    }
    return Temporal.Instant.compare(this.clock.now(), this.resumeAt) < 0;
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
