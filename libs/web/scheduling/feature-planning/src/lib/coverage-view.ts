import type { PlanningFacts } from './planning-facts';

/** Un besoin de la semaine : un créneau, un poste, un jour, face aux personnes affectées. */
export interface CoverageRow {
  date: string;
  dayLabel: string;
  /** `Sam.`. */
  dayAbbreviation: string;
  /** Identifie le créneau : deux créneaux d'un même jour peuvent porter le même libellé. */
  shiftTemplateId: string;
  shiftLabel: string;
  /** Travail effectif d'une affectation à ce créneau. */
  effectiveMinutes: number;
  hours: string;
  positionName: string;
  required: number;
  assigned: number;
  missing: number;
  assignedNames: string[];
  /** `Camille Laurent, Yanis Morel`. */
  assignedNamesLabel: string;
  /** `2 affectés sur 3 · 1 manquant`. */
  countLabel: string;
}

export interface DayCoverage {
  date: string;
  /** `Lundi 23 nov.` : le libellé du choix du jour. */
  optionLabel: string;
  rows: CoverageRow[];
}

export interface CoverageSummary {
  /** Places pourvues, sans compter une affectation au-delà du besoin. */
  assignedPlaces: number;
  requiredPlaces: number;
  percentLabel: string;
  gaps: CoverageRow[];
}

const PERCENT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

export function coverageRows(facts: PlanningFacts): CoverageRow[] {
  return facts.shifts.map((planned) => {
    const required = planned.shift.requiredCount;
    const assigned = planned.employeeIds.length;
    const missing = Math.max(required - assigned, 0);
    const assignedNames = planned.employeeIds.map((employeeId) => facts.nameOf(employeeId));
    return {
      date: planned.day.date,
      dayLabel: `${planned.day.name} ${planned.day.dayOfMonth}`,
      dayAbbreviation: planned.day.abbreviation,
      shiftTemplateId: planned.shift.shiftTemplateId,
      shiftLabel: planned.kind.label,
      effectiveMinutes: planned.shift.effectiveMinutes,
      hours: planned.kind.hours,
      positionName: planned.positionName,
      required,
      assigned,
      missing,
      assignedNames,
      assignedNamesLabel: assignedNames.join(', '),
      countLabel: countLabel(assigned, required, missing),
    };
  });
}

function countLabel(assigned: number, required: number, missing: number): string {
  const assignedLabel = `${assigned} affecté${assigned > 1 ? 's' : ''} sur ${required}`;
  if (missing === 0) return assignedLabel;
  return `${assignedLabel} · ${missing} manquant${missing > 1 ? 's' : ''}`;
}

export function coverageSummary(rows: CoverageRow[]): CoverageSummary {
  let assignedPlaces = 0;
  let requiredPlaces = 0;
  for (const row of rows) {
    assignedPlaces += Math.min(row.assigned, row.required);
    requiredPlaces += row.required;
  }
  const ratio = requiredPlaces === 0 ? 1 : assignedPlaces / requiredPlaces;
  return {
    assignedPlaces,
    requiredPlaces,
    percentLabel: PERCENT.format(ratio),
    gaps: rows.filter((row) => row.missing > 0),
  };
}

/** La couverture de chaque jour qui a au moins un besoin. */
export function coverageByDay(rows: CoverageRow[], facts: PlanningFacts): DayCoverage[] {
  const days: DayCoverage[] = [];
  for (const day of facts.days) {
    const dayRows = rows.filter((row) => row.date === day.date);
    if (dayRows.length === 0) continue;
    days.push({
      date: day.date,
      optionLabel: `${day.name} ${day.dayOfMonth} ${day.shortMonth}`,
      rows: dayRows,
    });
  }
  return days;
}
