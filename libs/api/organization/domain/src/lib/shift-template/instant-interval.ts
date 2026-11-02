/** Intervalle de temps réel, début inclus, fin exclue. */
export interface InstantInterval {
  start: Temporal.Instant;
  end: Temporal.Instant;
}

/** Minutes réellement écoulées entre deux instants. */
export function minutesBetween(from: Temporal.Instant, to: Temporal.Instant): number {
  return from.until(to, { largestUnit: 'minutes' }).minutes;
}

/** Minutes communes à deux intervalles ; 0 s'ils ne se chevauchent pas. */
export function overlapMinutes(first: InstantInterval, second: InstantInterval): number {
  const latestStart = latestOf(first.start, second.start);
  const earliestEnd = earliestOf(first.end, second.end);
  if (Temporal.Instant.compare(latestStart, earliestEnd) >= 0) {
    return 0;
  }
  return minutesBetween(latestStart, earliestEnd);
}

function latestOf(first: Temporal.Instant, second: Temporal.Instant): Temporal.Instant {
  if (Temporal.Instant.compare(first, second) >= 0) {
    return first;
  }
  return second;
}

function earliestOf(first: Temporal.Instant, second: Temporal.Instant): Temporal.Instant {
  if (Temporal.Instant.compare(first, second) <= 0) {
    return first;
  }
  return second;
}
