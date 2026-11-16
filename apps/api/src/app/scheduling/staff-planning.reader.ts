import { Injectable } from '@nestjs/common';
import { ListContracts, ListEmployees } from '@trame/api/staff/application';
import type { PlanningContract, PlanningEmployee } from '@trame/api/scheduling/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';

const PAGE_SIZE = 100;

/**
 * Lit dans le contexte `staff` les salariés d'un site, leurs habilitations et tous leurs contrats.
 * Le nom des salariés n'en sort pas : le problème n'en contient aucun.
 */
@Injectable()
export class StaffPlanningReader {
  constructor(
    private readonly listEmployees: ListEmployees,
    private readonly listContracts: ListContracts,
  ) {}

  async employeesOf(organizationId: string, siteId: string): Promise<PlanningEmployee[]> {
    const employees = await readAllPages((page) =>
      this.listEmployees.execute({ organizationId, siteId, page }),
    );
    const planningEmployees: PlanningEmployee[] = [];
    for (const employee of employees) {
      planningEmployees.push({
        id: employee.id,
        qualifications: employee.qualifications,
        contracts: await this.contractsOf(organizationId, employee.id),
      });
    }
    return planningEmployees;
  }

  private async contractsOf(
    organizationId: string,
    employeeId: string,
  ): Promise<PlanningContract[]> {
    const contracts = await readAllPages((page) =>
      this.listContracts.execute({ organizationId, employeeId, page }),
    );
    return contracts.map((contract) => ({
      weeklyMinutesMin: contract.weeklyMinutesMin,
      weeklyMinutesMax: contract.weeklyMinutesMax,
      startsOn: contract.startsOn,
      endsOn: contract.endsOn,
    }));
  }
}

async function readAllPages<T>(read: (page: PageRequest) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = [];
  let page: PageRequest = { limit: PAGE_SIZE };
  while (true) {
    const result = await read(page);
    items.push(...result.items);
    if (result.nextCursor === null) {
      return items;
    }
    page = { limit: PAGE_SIZE, after: result.nextCursor };
  }
}
