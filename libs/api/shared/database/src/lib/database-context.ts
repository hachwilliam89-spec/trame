import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from './prisma.service';

/**
 * Client Prisma des dépôts, et unité de travail qui peut traverser plusieurs contextes (ADR-0038).
 *
 * Pendant `atomically`, la transaction ouverte est rangée dans un `AsyncLocalStorage` : chaque
 * dépôt appelé par le travail, même à travers les use cases et les adaptateurs entre contextes,
 * écrit et lit par elle. Hors unité de travail, rien ne change : chaque requête part du client
 * Prisma, et chaque `transaction` de dépôt ouvre la sienne.
 */
@Injectable()
export class DatabaseContext {
  private readonly currentTransaction = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor(private readonly prisma: PrismaService) {}

  /** Transaction de l'unité de travail en cours, sinon le client Prisma. */
  get client(): Prisma.TransactionClient {
    return this.currentTransaction.getStore() ?? this.prisma;
  }

  /**
   * Écritures qu'un dépôt doit faire ensemble : elles rejoignent l'unité de travail en cours,
   * ou ouvrent leur propre transaction.
   */
  async transaction<Result>(
    work: (transaction: Prisma.TransactionClient) => Promise<Result>,
  ): Promise<Result> {
    const ongoing = this.currentTransaction.getStore();
    if (ongoing !== undefined) {
      return work(ongoing);
    }
    return this.prisma.$transaction((transaction) => work(transaction));
  }

  /**
   * Valide ensemble toutes les écritures faites par `work`, ou les annule toutes s'il échoue.
   * Une unité de travail ouverte dans une autre la rejoint.
   */
  async atomically<Result>(work: () => Promise<Result>): Promise<Result> {
    return this.transaction((transaction) => this.currentTransaction.run(transaction, work));
  }
}
