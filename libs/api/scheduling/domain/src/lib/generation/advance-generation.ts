import type {
  ScheduleOutcomeV1,
  ScheduleReportV1,
  SchedulingProblemV1,
} from '@trame/shared/contracts';
import type { ScheduleGeneration } from './schedule-generation';

/** Le planning reçu ne correspond pas au problème envoyé : il n'est jamais enregistré. */
export class InconsistentScheduleError extends Error {
  constructor(detail: string) {
    super(`Planning incohérent avec le problème envoyé : ${detail}.`);
  }
}

type Schedule = NonNullable<ScheduleOutcomeV1['result']['schedule']>;
type Shortfall = Schedule['shortfalls'][number];

/** Un rapport tardif ne peut ni rouvrir une génération ni remplacer son résultat. */
export function advanceGeneration(
  generation: ScheduleGeneration,
  report: ScheduleReportV1,
  now: Temporal.Instant,
): ScheduleGeneration | undefined {
  if (generation.status === 'SUCCEEDED' || generation.status === 'FAILED') {
    return undefined;
  }
  switch (report.kind) {
    case 'STARTED':
      if (generation.status === 'RUNNING') {
        return undefined;
      }
      return { ...generation, status: 'RUNNING' };
    case 'RESULT':
      ensureScheduleMatchesProblem(generation.problem, report.outcome);
      return { ...generation, status: 'SUCCEEDED', outcome: report.outcome, finishedAt: now };
    case 'FAILED':
      return { ...generation, status: 'FAILED', failure: report.code, finishedAt: now };
  }
}

/**
 * Contrôle de cohérence, pas de légalité : les règles restent dans le moteur (règle 5). Chaque
 * affectation vise un shift et un salarié du problème, une seule fois, sans dépasser le besoin ;
 * les manques annoncés sont exactement ceux que donnent les affectations.
 */
function ensureScheduleMatchesProblem(
  problem: SchedulingProblemV1,
  outcome: ScheduleOutcomeV1,
): void {
  const schedule = outcome.result.schedule;
  if (schedule === null) {
    return;
  }
  const assigned = countAssignments(problem, schedule);
  const expected = expectedShortfalls(problem, assigned);
  ensureSameShortfalls(schedule.shortfalls, expected);
}

function countAssignments(problem: SchedulingProblemV1, schedule: Schedule): Map<string, number> {
  const required = new Map(problem.shifts.map((shift) => [shift.id, shift.requiredCount]));
  const employees = new Set(problem.employees.map((employee) => employee.id));
  const pairs = new Set<string>();
  const assigned = new Map<string, number>();
  for (const assignment of schedule.assignments) {
    const pair = JSON.stringify([assignment.shiftId, assignment.employeeId]);
    if (pairs.has(pair)) {
      throw new InconsistentScheduleError('affectation en double');
    }
    pairs.add(pair);
    const requiredCount = required.get(assignment.shiftId);
    if (requiredCount === undefined || !employees.has(assignment.employeeId)) {
      throw new InconsistentScheduleError('shift ou salarié absent du problème');
    }
    const count = (assigned.get(assignment.shiftId) ?? 0) + 1;
    if (count > requiredCount) {
      throw new InconsistentScheduleError('plus de personnes que le besoin');
    }
    assigned.set(assignment.shiftId, count);
  }
  return assigned;
}

function expectedShortfalls(
  problem: SchedulingProblemV1,
  assigned: ReadonlyMap<string, number>,
): Map<string, Shortfall> {
  const expected = new Map<string, Shortfall>();
  for (const shift of problem.shifts) {
    const assignedCount = assigned.get(shift.id) ?? 0;
    if (assignedCount < shift.requiredCount) {
      expected.set(shift.id, {
        shiftId: shift.id,
        requiredCount: shift.requiredCount,
        assignedCount,
      });
    }
  }
  return expected;
}

function ensureSameShortfalls(
  announced: readonly Shortfall[],
  expected: ReadonlyMap<string, Shortfall>,
): void {
  if (announced.length !== expected.size) {
    throw new InconsistentScheduleError('manques annoncés différents des affectations');
  }
  const seen = new Set<string>();
  for (const shortfall of announced) {
    const match = expected.get(shortfall.shiftId);
    const isSame =
      match?.requiredCount === shortfall.requiredCount &&
      match.assignedCount === shortfall.assignedCount;
    if (!isSame || seen.has(shortfall.shiftId)) {
      throw new InconsistentScheduleError('manques annoncés différents des affectations');
    }
    seen.add(shortfall.shiftId);
  }
}
