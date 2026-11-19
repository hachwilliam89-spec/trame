import { Absence, type AbsenceReason } from '@trame/api/staff/domain';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import { ensureEmployeeExists } from '../ensure-employee-exists';
import type { AbsenceRepository } from '../ports/absence.repository';
import type { EmployeeRepository } from '../ports/employee.repository';

export interface DeclareAbsenceCommand {
  organizationId: string;
  employeeId: string;
  startsAt: Temporal.Instant;
  /** Fin de l'absence, exclue. */
  endsAt: Temporal.Instant;
  reason: AbsenceReason;
}

/**
 * Enregistre l'absence d'un employé de l'organisation (US-033). Elle ne modifie aucun planning
 * existant : seules les générations suivantes en tiennent compte.
 */
export class DeclareAbsence {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly absences: AbsenceRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: DeclareAbsenceCommand): Promise<Absence> {
    await ensureEmployeeExists(this.employees, command.organizationId, command.employeeId);
    const absence = Absence.create({
      ...command,
      id: this.ids.next(),
      createdAt: this.clock.now(),
    });
    await this.absences.add(absence);
    return absence;
  }
}
