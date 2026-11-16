import type { SchedulingProblemV1, SchedulingRuleV1 } from '@trame/shared/contracts';
import type { ExcludedEmployee } from './schedule-generation';
import type {
  PlanningContract,
  PlanningEmployee,
  PlanningShift,
  WeekPlanning,
} from './week-planning';

export class WeekMustStartOnMondayError extends Error {
  constructor() {
    super('La semaine commence un lundi.');
  }
}

export class NoCoverageNeedError extends Error {
  constructor() {
    super('Aucun besoin de couverture pour cette semaine.');
  }
}

/**
 * Les six règles du jalon 1, aux valeurs du cadrage §6, fixes à ce jalon (décision du
 * 16 novembre 2026) : repos quotidien de 11 h (C. trav. art. L3131-1), 10 h par jour
 * (art. L3121-18) et 48 h par semaine (art. L3121-20).
 */
export const MILESTONE_1_RULES: readonly SchedulingRuleV1[] = [
  { id: 'HABILITATION_REQUISE' },
  { id: 'UN_SEUL_SHIFT' },
  { id: 'REPOS_QUOTIDIEN_MIN', minimumMinutes: 11 * 60 },
  { id: 'DUREE_QUOTIDIENNE_MAX', maximumMinutes: 10 * 60 },
  { id: 'DUREE_HEBDOMADAIRE_MAX', maximumMinutes: 48 * 60 },
  { id: 'VOLUME_CONTRACTUEL' },
];

const ISO_MONDAY = 1;
const DAYS_AFTER_MONDAY = 6;

export interface ComposedProblem {
  readonly problem: SchedulingProblemV1;
  readonly excludedEmployees: readonly ExcludedEmployee[];
}

export function ensureWeekStartsOnMonday(weekStartsOn: Temporal.PlainDate): void {
  if (weekStartsOn.dayOfWeek !== ISO_MONDAY) {
    throw new WeekMustStartOnMondayError();
  }
}

/**
 * L'instantané envoyé au moteur. Shifts et salariés sont triés : un même état des besoins et
 * des contrats donne toujours le même problème.
 */
export function composeSchedulingProblem(planning: WeekPlanning): ComposedProblem {
  ensureWeekStartsOnMonday(planning.weekStartsOn);
  if (planning.shifts.length === 0) {
    throw new NoCoverageNeedError();
  }
  const weekEndsOn = planning.weekStartsOn.add({ days: DAYS_AFTER_MONDAY });
  const employees: SchedulingProblemV1['employees'] = [];
  const excludedEmployees: ExcludedEmployee[] = [];
  for (const employee of [...planning.employees].sort(byId)) {
    const contract = contractCoveringWeek(employee.contracts, planning.weekStartsOn, weekEndsOn);
    if (contract === undefined) {
      excludedEmployees.push({ employeeId: employee.id, reason: 'NO_CONTRACT_COVERING_WEEK' });
      continue;
    }
    employees.push(toProblemEmployee(employee, contract));
  }
  const shifts = [...planning.shifts]
    .sort(byStartThenId)
    .map((shift) => toProblemShift(shift, planning.timeZone));
  return {
    problem: {
      weekStartsOn: planning.weekStartsOn.toString(),
      timeZone: planning.timeZone,
      shifts,
      employees,
      rules: [...MILESTONE_1_RULES],
      objective: { mode: 'STANDARD' },
    },
    excludedEmployees,
  };
}

/** Le contrat en vigueur du lundi au dimanche ; les contrats d'un salarié ne se chevauchent pas. */
function contractCoveringWeek(
  contracts: readonly PlanningContract[],
  weekStartsOn: Temporal.PlainDate,
  weekEndsOn: Temporal.PlainDate,
): PlanningContract | undefined {
  return contracts.find((contract) => {
    const startsBeforeTheWeek = Temporal.PlainDate.compare(contract.startsOn, weekStartsOn) <= 0;
    if (contract.endsOn === undefined) {
      return startsBeforeTheWeek;
    }
    const endsAfterTheWeek = Temporal.PlainDate.compare(contract.endsOn, weekEndsOn) >= 0;
    return startsBeforeTheWeek && endsAfterTheWeek;
  });
}

function toProblemEmployee(
  employee: PlanningEmployee,
  contract: PlanningContract,
): SchedulingProblemV1['employees'][number] {
  const qualifications = employee.qualifications.map((qualification) => ({
    skillId: qualification.skillId,
    expiresOn: qualification.expiresOn?.toString() ?? null,
  }));
  return {
    id: employee.id,
    qualifications,
    contract: {
      weeklyMinutesMin: contract.weeklyMinutesMin,
      weeklyMinutesMax: contract.weeklyMinutesMax,
    },
  };
}

function toProblemShift(
  shift: PlanningShift,
  timeZone: string,
): SchedulingProblemV1['shifts'][number] {
  return {
    id: shiftId(shift),
    date: shift.date.toString(),
    shiftTemplateId: shift.shiftTemplateId,
    positionId: shift.positionId,
    startsAt: withSiteOffset(shift.startsAt, timeZone),
    endsAt: withSiteOffset(shift.endsAt, timeZone),
    effectiveMinutes: shift.effectiveMinutes,
    requiredSkillIds: [...shift.requiredSkillIds],
    requiredCount: shift.requiredCount,
  };
}

/** Stable d'un calcul à l'autre : le jour, le créneau type et le poste désignent le besoin. */
function shiftId(shift: PlanningShift): string {
  return `${shift.date.toString()}/${shift.shiftTemplateId}/${shift.positionId}`;
}

/** `2026-11-23T06:00:00+01:00` : l'heure lue sur le site, et l'instant sans ambiguïté. */
function withSiteOffset(instant: Temporal.Instant, timeZone: string): string {
  return instant.toZonedDateTimeISO(timeZone).toString({ timeZoneName: 'never' });
}

function byId(first: PlanningEmployee, second: PlanningEmployee): number {
  return first.id.localeCompare(second.id);
}

function byStartThenId(first: PlanningShift, second: PlanningShift): number {
  const byStart = Temporal.Instant.compare(first.startsAt, second.startsAt);
  if (byStart !== 0) {
    return byStart;
  }
  return shiftId(first).localeCompare(shiftId(second));
}
