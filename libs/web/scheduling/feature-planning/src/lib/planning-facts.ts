import type { ScheduleGenerationV1, SchedulingProblemV1 } from '@trame/shared/contracts/scheduling';
import type { PlanningCatalog } from '@trame/web/scheduling/data-access';
import { localMinutesOfDay, localTimeLabel, weekDays, type WeekDay } from './calendar';

type ProblemShift = SchedulingProblemV1['shifts'][number];

/** Un créneau type tel que le calcul l'a vu : horaires lus dans l'instantané, libellé du site. */
export interface ShiftKind {
  shiftTemplateId: string;
  label: string;
  /** `06 h–13 h 20`, à l'heure locale du site. */
  hours: string;
  /** Couleur de la légende, dans l'ordre des créneaux de la journée (1 : matin, 2 : après-midi). */
  tone: number;
}

/** Un shift du calcul, relié à son jour, à son créneau et aux salariés affectés. */
export interface PlannedShift {
  shift: ProblemShift;
  day: WeekDay;
  kind: ShiftKind;
  positionName: string;
  employeeIds: string[];
}

/** Index du calcul et du catalogue, construits une fois pour toutes les vues. */
export interface PlanningFacts {
  days: WeekDay[];
  shiftKinds: ShiftKind[];
  /** Dans l'ordre des jours, des créneaux de la journée, puis des postes du site. */
  shifts: PlannedShift[];
  positionOrder: Map<string, number>;
  nameOf(employeeId: string): string;
}

const MAX_TONE = 3;
const UNKNOWN_EMPLOYEE = 'Salarié inconnu';

export function planningFacts(
  generation: ScheduleGenerationV1,
  catalog: PlanningCatalog,
): PlanningFacts {
  const problem = generation.problem;
  const days = weekDays(problem.weekStartsOn);
  const shiftKinds = shiftKindsOf(problem, catalog);
  const positionOrder = new Map(catalog.positions.map((position, index) => [position.id, index]));
  const names = new Map(
    catalog.employees.map((employee) => [
      employee.id,
      `${employee.firstName} ${employee.lastName}`,
    ]),
  );
  return {
    days,
    shiftKinds,
    shifts: plannedShifts(generation, catalog, days, shiftKinds, positionOrder),
    positionOrder,
    nameOf: (employeeId) => names.get(employeeId) ?? UNKNOWN_EMPLOYEE,
  };
}

/** Un créneau par modèle, ordonné par son heure de début locale. */
function shiftKindsOf(problem: SchedulingProblemV1, catalog: PlanningCatalog): ShiftKind[] {
  const firstShiftOfTemplate = new Map<string, ProblemShift>();
  for (const shift of problem.shifts) {
    if (!firstShiftOfTemplate.has(shift.shiftTemplateId)) {
      firstShiftOfTemplate.set(shift.shiftTemplateId, shift);
    }
  }
  const labels = new Map(catalog.shiftTemplates.map((template) => [template.id, template.label]));
  const startOf = (shift: ProblemShift) => localMinutesOfDay(shift.startsAt, problem.timeZone);
  const ordered = [...firstShiftOfTemplate.values()].sort(
    (left, right) => startOf(left) - startOf(right),
  );
  return ordered.map((shift, index) => ({
    shiftTemplateId: shift.shiftTemplateId,
    label: labels.get(shift.shiftTemplateId) ?? 'Créneau',
    hours: `${localTimeLabel(shift.startsAt, problem.timeZone)}–${localTimeLabel(shift.endsAt, problem.timeZone)}`,
    tone: Math.min(index + 1, MAX_TONE),
  }));
}

function plannedShifts(
  generation: ScheduleGenerationV1,
  catalog: PlanningCatalog,
  days: WeekDay[],
  shiftKinds: ShiftKind[],
  positionOrder: Map<string, number>,
): PlannedShift[] {
  const employeesByShift = assigneesByShift(generation);
  const positionNames = new Map(catalog.positions.map((position) => [position.id, position.name]));
  const planned: PlannedShift[] = [];
  for (const shift of generation.problem.shifts) {
    const day = days.find((candidate) => candidate.date === shift.date);
    const kind = shiftKinds.find(
      (candidate) => candidate.shiftTemplateId === shift.shiftTemplateId,
    );
    if (day === undefined || kind === undefined) continue;
    planned.push({
      shift,
      day,
      kind,
      positionName: positionNames.get(shift.positionId) ?? 'Poste',
      employeeIds: employeesByShift.get(shift.id) ?? [],
    });
  }
  return planned.sort((left, right) => compareShifts(left, right, shiftKinds, positionOrder));
}

function assigneesByShift(generation: ScheduleGenerationV1): Map<string, string[]> {
  const employeesByShift = new Map<string, string[]>();
  for (const assignment of generation.outcome?.result.schedule?.assignments ?? []) {
    const assigned = employeesByShift.get(assignment.shiftId) ?? [];
    assigned.push(assignment.employeeId);
    employeesByShift.set(assignment.shiftId, assigned);
  }
  return employeesByShift;
}

function compareShifts(
  left: PlannedShift,
  right: PlannedShift,
  shiftKinds: ShiftKind[],
  positionOrder: Map<string, number>,
): number {
  if (left.day.date !== right.day.date) return left.day.date < right.day.date ? -1 : 1;
  const byKind = shiftKinds.indexOf(left.kind) - shiftKinds.indexOf(right.kind);
  if (byKind !== 0) return byKind;
  return (
    (positionOrder.get(left.shift.positionId) ?? 0) -
    (positionOrder.get(right.shift.positionId) ?? 0)
  );
}
