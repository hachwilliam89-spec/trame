import type { Employee } from '@trame/api/staff/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';

/** Employés enregistrés. Chaque lecture est limitée à une organisation. */
export interface EmployeeRepository {
  /** Enregistre l'employé et ses habilitations en une seule transaction. */
  add(employee: Employee): Promise<void>;

  /** `undefined` si l'employé n'existe pas dans cette organisation. */
  findById(organizationId: string, employeeId: string): Promise<Employee | undefined>;

  /** Employés du site, par ordre de création. */
  listBySite(organizationId: string, siteId: string, page: PageRequest): Promise<Page<Employee>>;
}
