import { InvalidWeekStartError } from './absence.errors';

const ISO_MONDAY = 1;
const DAYS_PER_WEEK = 7;

export interface WeekBounds {
  readonly from: Temporal.Instant;
  /** Exclu : le lundi suivant, à minuit. */
  readonly to: Temporal.Instant;
}

/**
 * Instants qui bornent une semaine : du lundi à minuit au lundi suivant à minuit, à l'heure du
 * site. La semaine d'un changement d'heure dure donc 167 ou 169 heures (ADR-0019).
 */
export function weekBounds(weekStartsOn: Temporal.PlainDate, timeZone: string): WeekBounds {
  if (weekStartsOn.dayOfWeek !== ISO_MONDAY) {
    throw new InvalidWeekStartError();
  }
  const nextMonday = weekStartsOn.add({ days: DAYS_PER_WEEK });
  return {
    from: weekStartsOn.toZonedDateTime({ timeZone }).toInstant(),
    to: nextMonday.toZonedDateTime({ timeZone }).toInstant(),
  };
}
