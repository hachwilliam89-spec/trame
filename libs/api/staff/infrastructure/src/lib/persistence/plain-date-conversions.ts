import { dateToInstant, instantToDate } from '@trame/api/database';

/**
 * Prisma lit et écrit une colonne `DATE` comme l'instant de minuit UTC de ce jour. Les deux
 * conversions passent donc par UTC, quel que soit le fuseau du site (ADR-0019).
 */

export function plainDateToDate(date: Temporal.PlainDate | undefined): Date | null {
  if (date === undefined) {
    return null;
  }
  return instantToDate(date.toZonedDateTime('UTC').toInstant());
}

export function dateToPlainDate(date: Date | null): Temporal.PlainDate | undefined {
  if (date === null) {
    return undefined;
  }
  return dateToInstant(date).toZonedDateTimeISO('UTC').toPlainDate();
}
