/** Les heures locales sont enregistrées en minutes depuis minuit (0 à 1439). */
export function toMinutesSinceMidnight(time: Temporal.PlainTime): number {
  return time.hour * 60 + time.minute;
}

export function fromMinutesSinceMidnight(minutes: number): Temporal.PlainTime {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Temporal.PlainTime(hour, minute);
}
