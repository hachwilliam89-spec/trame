import type { Employee } from '@trame/api/staff/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';
import { ensureSiteExists } from '../ensure-site-exists';
import type { EmployeeRepository } from '../ports/employee.repository';
import type { OrganizationCatalog } from '../ports/organization-catalog';

export interface ListEmployeesQuery {
  organizationId: string;
  siteId: string;
  page: PageRequest;
}

/** Liste les employés d'un site de l'organisation, par ordre de création. */
export class ListEmployees {
  constructor(
    private readonly catalog: OrganizationCatalog,
    private readonly employees: EmployeeRepository,
  ) {}

  async execute(query: ListEmployeesQuery): Promise<Page<Employee>> {
    await ensureSiteExists(this.catalog, query.organizationId, query.siteId);
    return this.employees.listBySite(query.organizationId, query.siteId, query.page);
  }
}
