import type { Absence, AbsenceReason } from '@trame/api/staff/domain';
import type { Clock } from '@trame/platform/clock';
import { findEmployeeOrThrow } from '../ensure-employee-exists';
import { AbsenceNotFoundError } from '../not-found.errors';
import type { AbsenceRepository } from '../ports/absence.repository';
import type { EmployeeRepository } from '../ports/employee.repository';
import type { AbsenceWeekReferenceFreezer } from './absence-week-reference-freezer';
import { findAbsenceOfEmployee } from './find-absence-of-employee';
import type { AbsenceWeeksLookup } from './absence-weeks-lookup';

export interface UpdateAbsenceCommand {
  organizationId: string;
  employeeId: string;
  absenceId: string;
  startsAt: Temporal.Instant;
  /** Fin de l'absence, exclue. */
  endsAt: Temporal.Instant;
  reason: AbsenceReason;
}

/**
 * Change la période ou le motif d'une absence. L'employé et l'instant de déclaration restent.
 * Une semaine déjà valorisée garde sa référence ; une semaine nouvellement touchée, ou encore
 * « à définir », fige la sienne à cet instant. Un jour valorisé que l'absence quitte, et
 * qu'aucune autre ne touche, perd sa durée dans la même transaction.
 */
export class UpdateAbsence {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly absences: AbsenceRepository,
    private readonly freezer: AbsenceWeekReferenceFreezer,
    private readonly weeks: AbsenceWeeksLookup,
    private readonly clock: Clock,
  ) {}

  async execute(command: UpdateAbsenceCommand): Promise<Absence> {
    const absence = await findAbsenceOfEmployee(
      this.absences,
      command.organizationId,
      command.employeeId,
      command.absenceId,
    );
    const changed = absence.changeTo({
      startsAt: command.startsAt,
      endsAt: command.endsAt,
      reason: command.reason,
    });
    const employee = await findEmployeeOrThrow(
      this.employees,
      command.organizationId,
      command.employeeId,
    );
    const references = await this.freezer.referencesToFreeze(employee, changed, this.clock.now());
    // Les semaines que l'absence quitte peuvent garder un jour valorisé devenu vide.
    const weeksBefore = await this.weeks.touchedBy(employee, absence);
    const stillExists = await this.absences.update(changed, references, weeksBefore);
    if (!stillExists) {
      throw new AbsenceNotFoundError();
    }
    return changed;
  }
}
