import type { Employee } from '@trame/api/staff/domain';
import { type Page, type PageRequest, pageOf } from '@trame/platform/pagination';
import type { EmployeeRepository } from '../lib/ports/employee.repository';

/** Dépôt en mémoire, pour les tests. */
export class InMemoryEmployeeRepository implements EmployeeRepository {
  private readonly employees: Employee[] = [];

  async add(employee: Employee): Promise<void> {
    this.employees.push(employee);
  }

  async findById(organizationId: string, employeeId: string): Promise<Employee | undefined> {
    return this.employees.find(
      (employee) => employee.organizationId === organizationId && employee.id === employeeId,
    );
  }

  async listBySite(
    organizationId: string,
    siteId: string,
    page: PageRequest,
  ): Promise<Page<Employee>> {
    const matching = this.employees.filter(
      (employee) => employee.organizationId === organizationId && employee.siteId === siteId,
    );
    return pageOf(matching, page);
  }
}
