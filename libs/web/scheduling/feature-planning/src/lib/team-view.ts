import type { SchedulingProblemV1 } from '@trame/shared/contracts/scheduling';
import { absencesOn, weeklyHours } from './absence-view';
import { durationLabel, type WeekDay } from './calendar';
import type { PlannedShift, PlanningFacts } from './planning-facts';

type ProblemEmployee = SchedulingProblemV1['employees'][number];

/** Une affectation dans la case d'un salarié. */
export interface TeamCell {
  shiftId: string;
  shiftLabel: string;
  tone: number;
  hours: string;
  positionName: string;
  /** Vrai si le salarié alterne entre plusieurs postes dans la semaine. */
  showsPosition: boolean;
  /** Ce que la case annonce quand on l'inspecte. */
  detail: string;
  effectiveMinutes: number;
}

export interface TeamRow {
  employeeId: string;
  name: string;
  /** Postes tenus dans la semaine, dans l'ordre des postes du site. */
  positionsLabel: string;
  /** Les affectations de chaque jour affiché, dans l'ordre de la grille. */
  cells: TeamCell[][];
  /** Les absences de chaque jour affiché, lues dans l'instantané : `Absence 06 h–10 h`. */
  absences: string[][];
  /** Les sept jours de la semaine, pour la vue Employé. */
  week: EmployeeDay[];
  plannedLabel: string;
  /** `7 h d’absence · minimum restant 21 h`, ou `undefined` sans absence valorisée. */
  absenceLabel: string | undefined;
  contractLabel: string;
}

/** Un jour de la vue Employé et ses affectations. */
export interface EmployeeDay {
  date: string;
  dayLabel: string;
  cells: TeamCell[];
  absences: string[];
  /** `Non planifié`, ou `Aucun besoin planifié` pour un jour sans besoin. */
  note: string;
}

/** Une ligne par salarié du calcul, regroupée par poste tenu puis par nom. */
export function teamRows(
  employees: ProblemEmployee[],
  facts: PlanningFacts,
  displayedDays: WeekDay[],
): TeamRow[] {
  const rows = employees.map((employee) => teamRow(employee, facts, displayedDays));
  return rows.sort((left, right) => compareRows(left, right, facts));
}

function teamRow(
  employee: ProblemEmployee,
  facts: PlanningFacts,
  displayedDays: WeekDay[],
): TeamRow {
  const name = facts.nameOf(employee.id);
  const worked = facts.shifts.filter((planned) => planned.employeeIds.includes(employee.id));
  const positionNames = positionsHeld(worked, facts);
  const showsPosition = positionNames.length > 1;
  const cellsByDate = new Map<string, TeamCell[]>();
  let plannedMinutes = 0;
  for (const planned of worked) {
    const date = planned.day.date;
    const cells = cellsByDate.get(date) ?? [];
    cells.push(teamCell(planned, name, showsPosition));
    cellsByDate.set(date, cells);
    plannedMinutes += planned.shift.effectiveMinutes;
  }
  const cellsOn = (day: WeekDay) => cellsByDate.get(day.date) ?? [];
  const absencesOnDay = (day: WeekDay) =>
    absencesOn(employee.unavailabilities, day.date, facts.timeZone);
  const hours = weeklyHours(employee.contract, plannedMinutes);
  return {
    employeeId: employee.id,
    name,
    positionsLabel: positionNames.length === 0 ? 'Non planifié' : positionNames.join(' · '),
    cells: displayedDays.map(cellsOn),
    absences: displayedDays.map(absencesOnDay),
    week: facts.days.map((day) => ({
      ...employeeDay(day, cellsOn(day), displayedDays),
      absences: absencesOnDay(day),
    })),
    ...hours,
  };
}

function employeeDay(
  day: WeekDay,
  cells: TeamCell[],
  displayedDays: WeekDay[],
): Omit<EmployeeDay, 'absences'> {
  const hasNeeds = displayedDays.some((displayed) => displayed.date === day.date);
  return {
    date: day.date,
    dayLabel: `${day.name} ${day.dayOfMonth}`,
    cells,
    note: hasNeeds ? 'Non planifié' : 'Aucun besoin planifié',
  };
}

function teamCell(planned: PlannedShift, name: string, showsPosition: boolean): TeamCell {
  const effectiveHours = durationLabel(planned.shift.effectiveMinutes);
  const dayLabel = `${planned.day.name} ${planned.day.dayOfMonth}`;
  return {
    shiftId: planned.shift.id,
    shiftLabel: planned.kind.label,
    tone: planned.kind.tone,
    hours: planned.kind.hours,
    positionName: planned.positionName,
    showsPosition,
    detail: `${name} · ${planned.positionName} · ${dayLabel} · ${planned.kind.hours} · ${effectiveHours} de travail effectif`,
    effectiveMinutes: planned.shift.effectiveMinutes,
  };
}

function positionsHeld(worked: PlannedShift[], facts: PlanningFacts): string[] {
  const positions = new Map<string, string>();
  for (const planned of worked) positions.set(planned.shift.positionId, planned.positionName);
  const order = (positionId: string) =>
    facts.positionOrder.get(positionId) ?? Number.MAX_SAFE_INTEGER;
  return [...positions.entries()]
    .sort(([left], [right]) => order(left) - order(right))
    .map(([, positionName]) => positionName);
}

/** Par premier poste tenu, puis par nom ; les salariés non planifiés à la fin. */
function compareRows(left: TeamRow, right: TeamRow, facts: PlanningFacts): number {
  const rank = (row: TeamRow) => firstPositionRank(row, facts);
  const byPosition = rank(left) - rank(right);
  if (byPosition !== 0) return byPosition;
  return left.name.localeCompare(right.name, 'fr');
}

function firstPositionRank(row: TeamRow, facts: PlanningFacts): number {
  let rank = Number.MAX_SAFE_INTEGER;
  for (const planned of facts.shifts) {
    if (!planned.employeeIds.includes(row.employeeId)) continue;
    rank = Math.min(rank, facts.positionOrder.get(planned.shift.positionId) ?? rank);
  }
  return rank;
}
