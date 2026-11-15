import { dateToInstant, instantToDate } from './instant-conversions';

/**
 * Prisma lit et écrit une colonne `DATE` comme l'instant de minuit UTC de ce jour. Les deux
 * conversions passent donc par UTC, quel que soit le fuseau du site (ADR-0019).
 */
export function plainDateToDate(date: Temporal.PlainDate): Date {
  return instantToDate(date.toZonedDateTime('UTC').toInstant());
}

export function dateToPlainDate(date: Date): Temporal.PlainDate {
  return dateToInstant(date).toZonedDateTimeISO('UTC').toPlainDate();
}
