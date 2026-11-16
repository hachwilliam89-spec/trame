import type {
  ScheduleFailureV1,
  ScheduleOutcomeV1,
  SchedulingProblemV1,
  SolveParametersV1,
} from '@trame/shared/contracts';

/** État du traitement ; l'issue du solveur (cinq issues, ADR-0020) est portée par `outcome`. */
export type ScheduleGenerationStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export type ExclusionReason = 'NO_CONTRACT_COVERING_WEEK';

/** Salarié du site laissé hors du calcul, avec son motif. */
export interface ExcludedEmployee {
  readonly employeeId: string;
  readonly reason: ExclusionReason;
}

/** Génération du planning d'une semaine : l'instantané envoyé au moteur et son résultat. */
export interface ScheduleGeneration {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly weekStartsOn: Temporal.PlainDate;
  readonly status: ScheduleGenerationStatus;
  /** Instantané figé au lancement : un besoin modifié ensuite ne change pas ce calcul. */
  readonly problem: SchedulingProblemV1;
  readonly parameters: SolveParametersV1;
  readonly excludedEmployees: readonly ExcludedEmployee[];
  readonly createdAt: Temporal.Instant;
  readonly outcome?: ScheduleOutcomeV1;
  readonly failure?: ScheduleFailureV1;
  readonly finishedAt?: Temporal.Instant;
}

/**
 * Paramètres de la démo : un worker et une graine fixe, sous la limite de 30 s du cadrage.
 * Le résultat stocké se restitue exactement ; un nouveau calcul coupé par la limite de temps
 * n'est pas garanti identique (ADR-0037).
 */
export const DEMO_SOLVE_PARAMETERS: SolveParametersV1 = {
  timeLimitSeconds: 30,
  workers: 1,
  seed: 0,
};

/** Issues qui proposent un planning exploitable (`CANCELLED`, hors jalon 1, n'en fait pas partie). */
export const SCHEDULE_STATUSES = ['OPTIMAL', 'FEASIBLE'] as const;

/** Un planning exploitable : la génération a abouti avec `OPTIMAL` ou `FEASIBLE`. */
export function hasSchedule(generation: ScheduleGeneration): boolean {
  if (generation.status !== 'SUCCEEDED' || generation.outcome === undefined) {
    return false;
  }
  const status: string = generation.outcome.result.status;
  return SCHEDULE_STATUSES.some((scheduleStatus) => scheduleStatus === status);
}

/** Même demande de lancement : même site et même semaine. */
export function isSameWeek(
  generation: ScheduleGeneration,
  siteId: string,
  weekStartsOn: Temporal.PlainDate,
): boolean {
  return generation.siteId === siteId && generation.weekStartsOn.equals(weekStartsOn);
}
