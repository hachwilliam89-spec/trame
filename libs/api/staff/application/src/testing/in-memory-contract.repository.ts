import { type Contract, ensureNoOverlappingContract } from '@trame/api/staff/domain';
import { type Page, type PageRequest, pageOf } from '@trame/platform/pagination';
import type { ContractRepository } from '../lib/ports/contract.repository';

/** Dépôt en mémoire, pour les tests. */
export class InMemoryContractRepository implements ContractRepository {
  private readonly contracts: Contract[] = [];

  async add(contract: Contract): Promise<void> {
    const contractsOfEmployee = this.contractsOf(contract.organizationId, contract.employeeId);
    ensureNoOverlappingContract(contractsOfEmployee, contract);
    this.contracts.push(contract);
  }

  async listByEmployee(
    organizationId: string,
    employeeId: string,
    page: PageRequest,
  ): Promise<Page<Contract>> {
    return pageOf(this.contractsOf(organizationId, employeeId), page);
  }

  private contractsOf(organizationId: string, employeeId: string): Contract[] {
    return this.contracts.filter(
      (contract) =>
        contract.organizationId === organizationId && contract.employeeId === employeeId,
    );
  }
}
