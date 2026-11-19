import type { Absence, AbsenceReason } from '@trame/api/staff/domain';
import { AbsenceNotFoundError } from '../not-found.errors';
import type { AbsenceRepository } from '../ports/absence.repository';
import { findAbsenceOfEmployee } from './find-absence-of-employee';

export interface UpdateAbsenceCommand {
  organizationId: string;
  employeeId: string;
  absenceId: string;
  startsAt: Temporal.Instant;
  /** Fin de l'absence, exclue. */
  endsAt: Temporal.Instant;
  reason: AbsenceReason;
}

/** Change la période ou le motif d'une absence. L'employé et l'instant de déclaration restent. */
export class UpdateAbsence {
  constructor(private readonly absences: AbsenceRepository) {}

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
    const stillExists = await this.absences.update(changed);
    if (!stillExists) {
      throw new AbsenceNotFoundError();
    }
    return changed;
  }
}
