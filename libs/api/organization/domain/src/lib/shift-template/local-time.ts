const MINUTES_PER_DAY = 24 * 60;

/** Vrai si l'heure tombe pile sur une minute : les créneaux se décrivent à la minute près. */
export function isWholeMinute(time: Temporal.PlainTime): boolean {
  const truncated = time.round({ smallestUnit: 'minute', roundingMode: 'trunc' });
  return time.equals(truncated);
}

/**
 * Minutes d'horloge murale entre deux heures locales, en passant minuit si `to` est plus tôt que
 * `from` : de 22 h à 6 h, 480 minutes. C'est la durée lue sur le planning ; la durée réelle, qui
 * dépend des changements d'heure, se calcule avec une date (`ShiftTemplate.durationsOn`).
 */
export function wallClockMinutesBetween(from: Temporal.PlainTime, to: Temporal.PlainTime): number {
  const difference = minutesSinceMidnight(to) - minutesSinceMidnight(from);
  if (difference < 0) {
    return difference + MINUTES_PER_DAY;
  }
  return difference;
}

function minutesSinceMidnight(time: Temporal.PlainTime): number {
  return time.hour * 60 + time.minute;
}
