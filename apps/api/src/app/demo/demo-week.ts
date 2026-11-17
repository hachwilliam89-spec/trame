const DAYS_IN_WEEK = 7;

/** Jour du calendrier du fuseau à cet instant (ADR-0019 : jamais de date naïve). */
export function todayIn(now: Temporal.Instant, timeZone: string): Temporal.PlainDate {
  return now.toZonedDateTimeISO(timeZone).toPlainDate();
}

/** Lundi strictement après `day` : un lundi donne le lundi d'après, un dimanche le lendemain. */
export function nextMondayAfter(day: Temporal.PlainDate): Temporal.PlainDate {
  // `dayOfWeek` va de 1 (lundi) à 7 (dimanche), selon l'ISO 8601.
  return day.add({ days: DAYS_IN_WEEK + 1 - day.dayOfWeek });
}
