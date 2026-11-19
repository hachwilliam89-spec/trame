import { findEmployeeOrThrow } from '../ensure-employee-exists';
import { AbsenceNotFoundError } from '../not-found.errors';
import type { AbsenceRepository } from '../ports/absence.repository';
import type { EmployeeRepository } from '../ports/employee.repository';
import { findAbsenceOfEmployee } from './find-absence-of-employee';
import type { AbsenceWeeksLookup } from './absence-weeks-lookup';

export interface DeleteAbsenceCommand {
  organizationId: string;
  employeeId: string;
  absenceId: string;
}

/**
 * Supprime une absence saisie par erreur. Les autres absences de l'employé restent ; un jour
 * valorisé qu'aucune absence ne touche plus perd sa durée, dans la même transaction (US-033).
 */
export class DeleteAbsence {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly absences: AbsenceRepository,
    private readonly weeks: AbsenceWeeksLookup,
  ) {}

  async execute(command: DeleteAbsenceCommand): Promise<void> {
    const absence = await findAbsenceOfEmployee(
      this.absences,
      command.organizationId,
      command.employeeId,
      command.absenceId,
    );
    const employee = await findEmployeeOrThrow(
      this.employees,
      command.organizationId,
      command.employeeId,
    );
    const weeks = await this.weeks.touchedBy(employee, absence);
    const removed = await this.absences.remove(absence, weeks);
    if (!removed) {
      throw new AbsenceNotFoundError();
    }
  }
}
