import { Prisma } from '../generated/prisma/client';

/** Permet aux adaptateurs de traduire une relation refusée par PostgreSQL en erreur métier. */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}
