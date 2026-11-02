/**
 * Prisma lit et écrit les colonnes `timestamptz` en `Date`. Le reste du code manipule des
 * `Temporal.Instant` (ADR-0027) : la conversion se fait ici, à la frontière, à la milliseconde.
 */
export function instantToDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

export function dateToInstant(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}
