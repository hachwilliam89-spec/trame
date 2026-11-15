import type { Contract } from '@trame/api/staff/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';
import { ensureEmployeeExists } from '../ensure-employee-exists';
import type { ContractRepository } from '../ports/contract.repository';
import type { EmployeeRepository } from '../ports/employee.repository';

export interface ListContractsQuery {
  organizationId: string;
  employeeId: string;
  page: PageRequest;
}

/** Liste les contrats d'un employé de l'organisation, par ordre de création. */
export class ListContracts {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly contracts: ContractRepository,
  ) {}

  async execute(query: ListContractsQuery): Promise<Page<Contract>> {
    await ensureEmployeeExists(this.employees, query.organizationId, query.employeeId);
    return this.contracts.listByEmployee(query.organizationId, query.employeeId, query.page);
  }
}
