import { type Absence, EqualShareReference, weekBounds } from '@trame/api/staff/domain';
import { findEmployeeOrThrow } from '../ensure-employee-exists';
import type { AbsenceWeekReferenceRepository } from '../ports/absence-week-reference.repository';
import type { AbsenceRepository } from '../ports/absence.repository';
import type { EmployeeRepository } from '../ports/employee.repository';
import { NoEqualShareReferenceError } from './absence-valuation.errors';

const ISO_MONDAY = 1;

export interface SetAbsenceDayValuationCommand {
  organizationId: string;
  employeeId: string;
  /** Jour couvert en partie par une absence. */
  day: Temporal.PlainDate;
  /** Durée valorisée, au plus la part journalière. */
  valuedMinutes: number;
}

/**
 * Donne la durée valorisée d'un jour couvert en partie par une absence, pour une semaine sans
 * planning de référence (US-033). Elle vaut pour la couverture du jour à la saisie, quelles que
 * soient les absences qui la forment : si elles la changent, la durée est redemandée.
 */
export class SetAbsenceDayValuation {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly absences: AbsenceRepository,
    private readonly references: AbsenceWeekReferenceRepository,
  ) {}

  async execute(command: SetAbsenceDayValuationCommand): Promise<void> {
    await findEmployeeOrThrow(this.employees, command.organizationId, command.employeeId);
    const weekStartsOn = command.day.subtract({ days: command.day.dayOfWeek - ISO_MONDAY });
    const reference = await this.references.find(
      command.organizationId,
      command.employeeId,
      weekStartsOn,
    );
    if (!(reference instanceof EqualShareReference)) {
      throw new NoEqualShareReferenceError();
    }
    const absences = await this.absencesOfWeek(command, reference);
    const valued = reference.withDayValuation(command.day, command.valuedMinutes, absences);
    if (!(await this.references.saveDayValuation(valued, command.day))) {
      throw new NoEqualShareReferenceError();
    }
  }

  /** Absences du salarié sur la semaine de la référence, à l'heure du site. */
  private absencesOfWeek(
    command: SetAbsenceDayValuationCommand,
    reference: EqualShareReference,
  ): Promise<Absence[]> {
    const { from, to } = weekBounds(reference.weekStartsOn, reference.timeZone);
    return this.absences.listByEmployeeOverlapping(
      command.organizationId,
      command.employeeId,
      from,
      to,
    );
  }
}
