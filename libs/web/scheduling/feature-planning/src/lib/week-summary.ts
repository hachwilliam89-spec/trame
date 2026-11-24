import type { ScheduleGenerationV1 } from '@trame/shared/contracts/scheduling';
import { durationLabel } from './calendar';
import type { CoverageRow, CoverageSummary } from './coverage-view';

/** Les chiffres de la semaine, tous lus dans la génération affichée. */
export interface WeekSummary {
  assignedPlaces: number;
  requiredPlaces: number;
  /** `98 %`. */
  coverageLabel: string;
  missingPlaces: number;
  /** `sam. matin`, `sur 2 créneaux`, ou `undefined` sans manque. */
  missingDetail: string | undefined;
  /** `350 h` : travail effectif de toutes les affectations. */
  plannedHoursLabel: string;
  /** Règles que le moteur a vérifiées pour ce planning : six pour une génération d'avant US-033. */
  checkedRulesCount: number;
  /** `7 règles`, `1 règle`. */
  checkedRulesLabel: string;
  /** `Proposé par le moteur · 4,2 s`. */
  engineLabel: string | undefined;
}

type GapSlot = Pick<CoverageRow, 'date' | 'dayAbbreviation' | 'shiftTemplateId' | 'shiftLabel'>;

const SECONDS = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const SECONDS_PER_MINUTE = 60;
const SHORTEST_SHOWN_SECONDS = 0.1;

export function weekSummary(
  generation: ScheduleGenerationV1,
  rows: CoverageRow[],
  coverage: CoverageSummary,
): WeekSummary {
  let missingPlaces = 0;
  let plannedMinutes = 0;
  for (const row of rows) {
    missingPlaces += row.missing;
    plannedMinutes += row.assigned * row.effectiveMinutes;
  }
  const outcome = generation.outcome;
  const checkedRulesCount = outcome?.checkedRules.length ?? 0;
  return {
    assignedPlaces: coverage.assignedPlaces,
    requiredPlaces: coverage.requiredPlaces,
    coverageLabel: coverage.percentLabel,
    missingPlaces,
    missingDetail: missingDetail(coverage.gaps),
    plannedHoursLabel: durationLabel(plannedMinutes),
    checkedRulesCount,
    checkedRulesLabel: `${checkedRulesCount} règle${checkedRulesCount > 1 ? 's' : ''}`,
    engineLabel: outcome === undefined ? undefined : engineLabel(outcome.solveSeconds),
  };
}

/**
 * Le créneau du manque, s'il n'y en a qu'un ; sinon le nombre de créneaux touchés. Un créneau est
 * un jour et un modèle de créneau, jamais un libellé ; plusieurs postes en manque n'en font qu'un.
 */
export function missingDetail(gaps: readonly GapSlot[]): string | undefined {
  const slots = new Map<string, GapSlot>();
  for (const gap of gaps) slots.set(`${gap.date}/${gap.shiftTemplateId}`, gap);
  const [first] = slots.values();
  if (first === undefined) return undefined;
  if (slots.size > 1) return `sur ${slots.size} créneaux`;
  return `${first.dayAbbreviation.toLowerCase()} ${first.shiftLabel.toLowerCase()}`;
}

/** La durée du calcul : `4,2 s`, `1 min 5 s`. */
export function engineLabel(solveSeconds: number): string {
  return `Proposé par le moteur · ${solveDurationLabel(solveSeconds)}`;
}

function solveDurationLabel(solveSeconds: number): string {
  if (solveSeconds < SHORTEST_SHOWN_SECONDS) return 'moins de 0,1 s';
  // Arrondir avant de décomposer : 59,96 s s'écrirait sinon « 60 s », et 119,9 s « 1 min 60 s ».
  const tenthsOfSecond = Math.round(solveSeconds * 10) / 10;
  if (tenthsOfSecond < SECONDS_PER_MINUTE) return `${SECONDS.format(tenthsOfSecond)} s`;
  const totalSeconds = Math.round(solveSeconds);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds} s`;
}
