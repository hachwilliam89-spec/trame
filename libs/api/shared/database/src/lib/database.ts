import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from './prisma.service';

/** Client des requêtes : celui de l'application, ou celui d'une transaction déjà ouverte. */
export type DatabaseClient = Prisma.TransactionClient;

/**
 * Accès à la base d'un dépôt. Hors unité de travail, chaque transaction demandée par un dépôt est
 * la sienne. Dans une unité de travail (`runAtomically`), toutes ses requêtes passent par la
 * transaction de l'unité (ADR-0038).
 */
export abstract class Database {
  /** Client des lectures et des écritures. */
  abstract readonly client: DatabaseClient;

  /** Exécute `work` dans une transaction : une nouvelle, ou celle de l'unité de travail en cours. */
  abstract transaction<Result>(work: (client: DatabaseClient) => Promise<Result>): Promise<Result>;
}

/** Base de l'application : chaque transaction demandée en ouvre une nouvelle. */
@Injectable()
export class PrismaDatabase extends Database {
  readonly client: DatabaseClient;

  constructor(private readonly prisma: PrismaService) {
    super();
    this.client = prisma;
  }

  transaction<Result>(work: (client: DatabaseClient) => Promise<Result>): Promise<Result> {
    return this.prisma.$transaction(work);
  }
}

/**
 * Base d'une unité de travail : ses requêtes passent par la transaction de l'unité, et les
 * transactions demandées par les dépôts la rejoignent au lieu d'en ouvrir une autre.
 */
class UnitOfWorkDatabase extends Database {
  constructor(readonly client: DatabaseClient) {
    super();
  }

  transaction<Result>(work: (client: DatabaseClient) => Promise<Result>): Promise<Result> {
    return work(this.client);
  }
}

export interface AtomicWorkOptions {
  /** Durée maximale de la transaction ; au-delà, Prisma l'annule. */
  timeoutMs: number;
}

/**
 * Unité de travail : `work` reçoit une base dont toutes les requêtes passent par une même
 * transaction, validée si `work` aboutit et annulée s'il lève une erreur.
 */
export function runAtomically<Result>(
  prisma: PrismaService,
  options: AtomicWorkOptions,
  work: (database: Database) => Promise<Result>,
): Promise<Result> {
  return prisma.$transaction((client) => work(new UnitOfWorkDatabase(client)), {
    timeout: options.timeoutMs,
  });
}
