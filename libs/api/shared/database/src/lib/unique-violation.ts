import { Prisma } from '../generated/prisma/client';

/**
 * Vrai si l'erreur vient d'une contrainte d'unicité de la base (code Prisma P2002).
 * Les dépôts s'en servent pour traduire une création simultanée en erreur métier.
 */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
