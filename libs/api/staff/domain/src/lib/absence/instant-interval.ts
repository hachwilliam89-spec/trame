/** Intervalle de temps réel, début inclus, fin exclue. */
export interface InstantInterval {
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
}

/**
 * Réunit des intervalles : ceux qui se chevauchent ou se touchent n'en font plus qu'un. Le
 * résultat est trié et sans recouvrement, si bien qu'une minute couverte deux fois n'y figure
 * qu'une fois.
 */
export function unionOf(intervals: readonly InstantInterval[]): InstantInterval[] {
  const sorted = [...intervals].sort((first, second) =>
    Temporal.Instant.compare(first.start, second.start),
  );
  const union: InstantInterval[] = [];
  for (const interval of sorted) {
    const last = union.at(-1);
    if (last === undefined || Temporal.Instant.compare(interval.start, last.end) > 0) {
      union.push(interval);
      continue;
    }
    union[union.length - 1] = { start: last.start, end: latestOf(last.end, interval.end) };
  }
  return union;
}

/** Minutes de `interval` couvertes par une union d'intervalles sans recouvrement. */
export function minutesCoveredBy(
  union: readonly InstantInterval[],
  interval: InstantInterval,
): number {
  let covered = 0;
  for (const part of union) {
    covered += overlapMinutes(part, interval);
  }
  return covered;
}

/** Minutes réellement écoulées entre deux instants. */
export function minutesBetween(from: Temporal.Instant, to: Temporal.Instant): number {
  return from.until(to, { largestUnit: 'minutes' }).minutes;
}

/** Parties d'une union d'intervalles comprises dans `bounds`, dans le même ordre. */
export function clippedTo(
  union: readonly InstantInterval[],
  bounds: InstantInterval,
): InstantInterval[] {
  const clipped: InstantInterval[] = [];
  for (const interval of union) {
    const start = latestOf(interval.start, bounds.start);
    const end = earliestOf(interval.end, bounds.end);
    if (Temporal.Instant.compare(start, end) < 0) {
      clipped.push({ start, end });
    }
  }
  return clipped;
}

/** Vrai si les deux listes contiennent les mêmes intervalles, dans le même ordre. */
export function sameIntervals(
  first: readonly InstantInterval[],
  second: readonly InstantInterval[],
): boolean {
  if (first.length !== second.length) {
    return false;
  }
  return first.every((interval, index) => isSameInterval(interval, second[index]));
}

/** Vrai si `inner` est entièrement compris dans `outer`. */
export function isWithin(inner: InstantInterval, outer: InstantInterval): boolean {
  const startsInside = Temporal.Instant.compare(inner.start, outer.start) >= 0;
  const endsInside = Temporal.Instant.compare(inner.end, outer.end) <= 0;
  return startsInside && endsInside;
}

function isSameInterval(first: InstantInterval, second: InstantInterval | undefined): boolean {
  if (second === undefined) {
    return false;
  }
  return first.start.equals(second.start) && first.end.equals(second.end);
}

function overlapMinutes(first: InstantInterval, second: InstantInterval): number {
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
