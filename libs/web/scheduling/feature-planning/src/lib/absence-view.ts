import { durationLabel, localDateOf, localMinutesOfDay, localTimeLabel } from './calendar';

/** Une indisponibilité telle que le calcul l'a reçue : instants avec décalage, fin exclue. */
export interface UnavailablePeriod {
  startsAt: string;
  endsAt: string;
}

/** Les bornes d'un contrat dans l'instantané, et les minutes d'absence valorisées (US-033). */
export interface SnapshotContract {
  weeklyMinutesMin: number;
  weeklyMinutesMax: number;
  absenceMinutes?: number;
}

/** Les heures d'un salarié face à son contrat, prêtes à afficher. */
export interface WeeklyHours {
  /** `28 h`. */
  plannedLabel: string;
  /** `7 h d’absence · minimum restant 21 h`, sans minutes d'absence : `undefined`. */
  absenceLabel: string | undefined;
  /** `Contrat 28–35 h`. */
  contractLabel: string;
}

const ABSENCE = 'Absence';

/**
 * Ce que la case d'un jour annonce des indisponibilités du calcul, à l'heure du site :
 * `Absence` pour la journée entière, sinon sa plage horaire. Un jour de changement d'heure
 * reste une journée entière : on compare des jours civils, jamais des durées de 24 h.
 */
export function absencesOn(
  periods: readonly UnavailablePeriod[],
  date: string,
  timeZone: string,
): string[] {
  const labels: string[] = [];
  for (const period of periods) {
    const label = absenceLabelOn(period, date, timeZone);
    if (label !== undefined) labels.push(label);
  }
  return labels;
}

function absenceLabelOn(
  period: UnavailablePeriod,
  date: string,
  timeZone: string,
): string | undefined {
  const startDate = localDateOf(period.startsAt, timeZone);
  const endDate = localDateOf(period.endsAt, timeZone);
  const endsAtMidnight = localMinutesOfDay(period.endsAt, timeZone) === 0;
  const startsLater = startDate > date;
  // La fin est exclue : une absence qui finit à minuit ne touche pas le jour qui commence.
  const endsEarlier = endDate < date || (endDate === date && endsAtMidnight);
  if (startsLater || endsEarlier) return undefined;
  const coversDayStart = startDate < date || localMinutesOfDay(period.startsAt, timeZone) === 0;
  const coversDayEnd = endDate > date;
  const from = localTimeLabel(period.startsAt, timeZone);
  const until = localTimeLabel(period.endsAt, timeZone);
  if (coversDayStart && coversDayEnd) return ABSENCE;
  if (coversDayStart) return `${ABSENCE} jusqu’à ${until}`;
  if (coversDayEnd) return `${ABSENCE} dès ${from}`;
  return `${ABSENCE} ${from}–${until}`;
}

/** Les heures planifiées, l'absence valorisée et le minimum qui reste, face au contrat. */
export function weeklyHours(contract: SnapshotContract, plannedMinutes: number): WeeklyHours {
  const absenceMinutes = contract.absenceMinutes ?? 0;
  return {
    plannedLabel: durationLabel(plannedMinutes),
    absenceLabel: absenceMinutes === 0 ? undefined : absenceSummary(contract, absenceMinutes),
    contractLabel: `Contrat ${contractRange(contract.weeklyMinutesMin, contract.weeklyMinutesMax)}`,
  };
}

function absenceSummary(contract: SnapshotContract, absenceMinutes: number): string {
  // Le moteur juge le volume sur ce minimum restant (VOLUME_CONTRACTUEL, US-033).
  const remainingMinimum = Math.max(0, contract.weeklyMinutesMin - absenceMinutes);
  return `${durationLabel(absenceMinutes)} d’absence · minimum restant ${durationLabel(remainingMinimum)}`;
}

/** `28–35 h`, ou `35 h` quand le minimum égale le maximum. */
function contractRange(minimumMinutes: number, maximumMinutes: number): string {
  if (minimumMinutes === maximumMinutes) return durationLabel(maximumMinutes);
  const minimum = durationLabel(minimumMinutes).replace(/ h$/, '');
  return `${minimum}–${durationLabel(maximumMinutes)}`;
}
