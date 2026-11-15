import { EmployeeNotFoundError } from './not-found.errors';
import type { EmployeeRepository } from './ports/employee.repository';

/** Lève `EmployeeNotFoundError` si l'employé n'existe pas dans cette organisation. */
export async function ensureEmployeeExists(
  employees: EmployeeRepository,
  organizationId: string,
  employeeId: string,
): Promise<void> {
  const employee = await employees.findById(organizationId, employeeId);
  if (employee === undefined) {
    throw new EmployeeNotFoundError();
  }
}
