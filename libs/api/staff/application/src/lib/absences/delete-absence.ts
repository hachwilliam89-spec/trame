import { AbsenceNotFoundError } from '../not-found.errors';
import type { AbsenceRepository } from '../ports/absence.repository';
import { findAbsenceOfEmployee } from './find-absence-of-employee';

export interface DeleteAbsenceCommand {
  organizationId: string;
  employeeId: string;
  absenceId: string;
}

/** Supprime une absence saisie par erreur. Les autres absences de l'employé restent. */
export class DeleteAbsence {
  constructor(private readonly absences: AbsenceRepository) {}

  async execute(command: DeleteAbsenceCommand): Promise<void> {
    await findAbsenceOfEmployee(
      this.absences,
      command.organizationId,
      command.employeeId,
      command.absenceId,
    );
    const removed = await this.absences.remove(command.organizationId, command.absenceId);
    if (!removed) {
      throw new AbsenceNotFoundError();
    }
  }
}
