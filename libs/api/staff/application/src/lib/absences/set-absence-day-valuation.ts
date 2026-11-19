import { EqualShareReference } from '@trame/api/staff/domain';
import { findEmployeeOrThrow } from '../ensure-employee-exists';
import type { AbsenceWeekReferenceRepository } from '../ports/absence-week-reference.repository';
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
 * planning de référence (US-033). Elle vaut pour le salarié et le jour, quelle que soit l'absence
 * qui couvre ce jour.
 */
export class SetAbsenceDayValuation {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly references: AbsenceWeekReferenceRepository,
  ) {}

  async execute(command: SetAbsenceDayValuationCommand): Promise<EqualShareReference> {
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
    const valued = reference.withDayValuation(command.day, command.valuedMinutes);
    if (!(await this.references.saveDayValuations(valued))) {
      throw new NoEqualShareReferenceError();
    }
    return valued;
  }
}
