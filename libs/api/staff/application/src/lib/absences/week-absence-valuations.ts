import {
  type Absence,
  type AbsenceValuation,
  type AbsenceWeekReference,
  valueAbsencesOfWeek,
} from '@trame/api/staff/domain';

/** Valorisation des absences d'un employé sur la semaine, et la référence qui la fonde. */
export interface EmployeeAbsenceValuation {
  readonly employeeId: string;
  /** `undefined` : aucune référence figée, la valorisation reste « à définir ». */
  readonly reference: AbsenceWeekReference | undefined;
  readonly valuation: AbsenceValuation;
}

/**
 * Valorise les absences de chaque employé qui en a dans la semaine, triées par employé.
 * `absencesOfWeek` ne contient que des absences qui touchent la semaine.
 */
export function valuationsOf(
  absencesOfWeek: readonly Absence[],
  references: readonly AbsenceWeekReference[],
): EmployeeAbsenceValuation[] {
  const valuations: EmployeeAbsenceValuation[] = [];
  for (const [employeeId, absencesOfEmployee] of groupByEmployee(absencesOfWeek)) {
    const reference = references.find((candidate) => candidate.employeeId === employeeId);
    valuations.push({
      employeeId,
      reference,
      valuation: valueAbsencesOfWeek(reference, absencesOfEmployee),
    });
  }
  return valuations.sort((first, second) => first.employeeId.localeCompare(second.employeeId));
}

/** Absences regroupées par employé, dans leur ordre d'origine. */
export function groupByEmployee(absences: readonly Absence[]): Map<string, Absence[]> {
  const byEmployee = new Map<string, Absence[]>();
  for (const absence of absences) {
    const absencesOfEmployee = byEmployee.get(absence.employeeId) ?? [];
    absencesOfEmployee.push(absence);
    byEmployee.set(absence.employeeId, absencesOfEmployee);
  }
  return byEmployee;
}
