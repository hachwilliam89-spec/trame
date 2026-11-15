import { Contract } from '@trame/api/staff/domain';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import { ensureEmployeeExists } from '../ensure-employee-exists';
import type { ContractRepository } from '../ports/contract.repository';
import type { EmployeeRepository } from '../ports/employee.repository';

export interface CreateContractCommand {
  organizationId: string;
  employeeId: string;
  weeklyMinutesMin: number;
  weeklyMinutesMax: number;
  startsOn: Temporal.PlainDate;
  endsOn: Temporal.PlainDate | undefined;
}

/**
 * Enregistre le contrat d'un employé de l'organisation. Le dépôt refuse un contrat dont la
 * période chevauche celle d'un autre contrat du même employé (US-032).
 */
export class CreateContract {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly contracts: ContractRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateContractCommand): Promise<Contract> {
    await ensureEmployeeExists(this.employees, command.organizationId, command.employeeId);
    const contract = Contract.create({
      ...command,
      id: this.ids.next(),
      createdAt: this.clock.now(),
    });
    await this.contracts.add(contract);
    return contract;
  }
}
