import type { Absence, AbsenceWeekReference } from '@trame/api/staff/domain';
import type { Clock } from '@trame/platform/clock';
import type { AbsenceWeekReferenceRepository } from '../ports/absence-week-reference.repository';
import type { EmployeeRepository } from '../ports/employee.repository';
import type { AbsenceWeekReferenceFreezer } from './absence-week-reference-freezer';

/**
 * Retente le gel des références restées « à définir » (US-033) : des besoins, un contrat ou une
 * génération ont pu apparaître depuis la déclaration. Le gel suit les mêmes règles qu'à la
 * déclaration, à l'instant du nouvel essai. Une référence déjà figée ne change jamais.
 */
export class PendingWeekReferences {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly freezer: AbsenceWeekReferenceFreezer,
    private readonly references: AbsenceWeekReferenceRepository,
    private readonly clock: Clock,
  ) {}

  /** Vrai si une référence au moins a été figée. */
  async freeze(
    organizationId: string,
    weekStartsOn: Temporal.PlainDate,
    absencesByEmployee: ReadonlyMap<string, readonly Absence[]>,
  ): Promise<boolean> {
    const frozenAt = this.clock.now();
    const toFreeze: AbsenceWeekReference[] = [];
    for (const [employeeId, absences] of absencesByEmployee) {
      const reference = await this.referenceToFreeze(
        organizationId,
        employeeId,
        weekStartsOn,
        absences,
        frozenAt,
      );
      if (reference !== undefined) {
        toFreeze.push(reference);
      }
    }
    if (toFreeze.length === 0) {
      return false;
    }
    await this.references.saveIfAbsent(toFreeze);
    return true;
  }

  private async referenceToFreeze(
    organizationId: string,
    employeeId: string,
    weekStartsOn: Temporal.PlainDate,
    absences: readonly Absence[],
    frozenAt: Temporal.Instant,
  ): Promise<AbsenceWeekReference | undefined> {
    const employee = await this.employees.findById(organizationId, employeeId);
    const [anyAbsence] = absences;
    if (employee === undefined || anyAbsence === undefined) {
      return undefined;
    }
    const references = await this.freezer.referencesToFreeze(employee, anyAbsence, frozenAt);
    return references.find((reference) => reference.weekStartsOn.equals(weekStartsOn));
  }
}
