import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export interface DatabaseOptions {
  /** URL PostgreSQL (`postgresql://…`). */
  url: string;
  /** Borne connexion et requête SQL pour un processus supervisé ; défaut du pilote sinon. */
  requestTimeoutMs?: number;
}

export const DATABASE_OPTIONS = Symbol('DATABASE_OPTIONS');

/**
 * Client Prisma de l'API, via l'adaptateur de pilote `@prisma/adapter-pg` (obligatoire avec Prisma 7).
 * La connexion s'ouvre à la première requête ; `health/ready` vérifie qu'elle répond.
 * Réservé aux adaptateurs de la couche `infrastructure` (ADR-0008).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(DATABASE_OPTIONS) options: DatabaseOptions) {
    super({
      adapter: new PrismaPg({
        connectionString: options.url,
        connectionTimeoutMillis: options.requestTimeoutMs,
        query_timeout: options.requestTimeoutMs,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
