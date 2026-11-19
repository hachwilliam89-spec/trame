import { Absence, type AbsenceReason } from '@trame/api/staff/domain';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import { findEmployeeOrThrow } from '../ensure-employee-exists';
import type { AbsenceRepository } from '../ports/absence.repository';
import type { EmployeeRepository } from '../ports/employee.repository';
import type { AbsenceWeekReferenceFreezer } from './absence-week-reference-freezer';

export interface DeclareAbsenceCommand {
  organizationId: string;
  employeeId: string;
  startsAt: Temporal.Instant;
  /** Fin de l'absence, exclue. */
  endsAt: Temporal.Instant;
  reason: AbsenceReason;
}

/**
 * Enregistre l'absence d'un employé de l'organisation (US-033), avec la référence qui valorisera
 * chaque semaine touchée, figée à cet instant. Elle ne modifie aucun planning existant : seules
 * les générations suivantes en tiennent compte.
 */
export class DeclareAbsence {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly absences: AbsenceRepository,
    private readonly freezer: AbsenceWeekReferenceFreezer,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: DeclareAbsenceCommand): Promise<Absence> {
    const employee = await findEmployeeOrThrow(
      this.employees,
      command.organizationId,
      command.employeeId,
    );
    const absence = Absence.create({
      ...command,
      id: this.ids.next(),
      createdAt: this.clock.now(),
    });
    const references = await this.freezer.referencesToFreeze(employee, absence, absence.createdAt);
    await this.absences.add(absence, references);
    return absence;
  }
}
