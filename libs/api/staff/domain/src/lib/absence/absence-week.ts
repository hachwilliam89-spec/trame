import type { Absence } from './absence';
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

/**
 * Lundis des semaines qu'une absence touche, à l'heure du site. La fin étant exclue, une absence
 * qui finit le lundi à minuit ne touche pas la semaine qui commence alors.
 */
export function weeksTouchedBy(absence: Absence, timeZone: string): Temporal.PlainDate[] {
  const firstDay = absence.startsAt.toZonedDateTimeISO(timeZone).toPlainDate();
  // Une absence tombe sur une minute entière : sa dernière minute commence une minute avant la fin.
  const lastDay = absence.endsAt
    .subtract({ minutes: 1 })
    .toZonedDateTimeISO(timeZone)
    .toPlainDate();
  const mondays: Temporal.PlainDate[] = [];
  let monday = mondayOf(firstDay);
  while (Temporal.PlainDate.compare(monday, lastDay) <= 0) {
    mondays.push(monday);
    monday = monday.add({ days: DAYS_PER_WEEK });
  }
  return mondays;
}

function mondayOf(day: Temporal.PlainDate): Temporal.PlainDate {
  return day.subtract({ days: day.dayOfWeek - ISO_MONDAY });
}
