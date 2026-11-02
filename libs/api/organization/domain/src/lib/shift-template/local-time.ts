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

/**
 * Instant désigné par une date et une heure locales du site : le premier instant où l'horloge du
 * site les affiche, ou affiche plus tard.
 * - Heure ordinaire : l'instant où l'horloge l'affiche.
 * - Heure répétée, au passage à l'heure d'hiver : sa première occurrence.
 * - Heure sautée, au passage à l'heure d'été : l'instant du saut, car l'horloge passe directement
 *   au-delà. Le comportement par défaut de Temporal la décalerait d'une heure, ce qui peut placer
 *   le début d'un créneau après sa fin.
 * Cette règle conserve l'ordre : une heure locale plus tardive ne donne jamais un instant plus tôt.
 */
export function instantOfLocalTime(
  dateTime: Temporal.PlainDateTime,
  timeZone: string,
): Temporal.Instant {
  const earliestMatch = dateTime.toZonedDateTime(timeZone, { disambiguation: 'earlier' });
  const clockShowsIt = earliestMatch.toPlainDateTime().equals(dateTime);
  if (clockShowsIt) {
    return earliestMatch.toInstant();
  }

  // Heure sautée : Temporal l'a placée avant le saut ; le changement d'heure suivant est ce saut.
  const jump = earliestMatch.getTimeZoneTransition('next');
  if (jump === null) {
    throw new RangeError(`Aucun changement d'heure après ${earliestMatch.toString()}.`);
  }
  return jump.toInstant();
}

function minutesSinceMidnight(time: Temporal.PlainTime): number {
  return time.hour * 60 + time.minute;
}
