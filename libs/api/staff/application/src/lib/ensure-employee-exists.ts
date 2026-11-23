import type { Employee } from '@trame/api/staff/domain';
import { EmployeeNotFoundError } from './not-found.errors';
import type { EmployeeRepository } from './ports/employee.repository';

/** Lève `EmployeeNotFoundError` si l'employé n'existe pas dans cette organisation. */
export async function ensureEmployeeExists(
  employees: EmployeeRepository,
  organizationId: string,
  employeeId: string,
): Promise<void> {
  await findEmployeeOrThrow(employees, organizationId, employeeId);
}

/** L'employé de l'organisation, ou `EmployeeNotFoundError`. */
export async function findEmployeeOrThrow(
  employees: EmployeeRepository,
  organizationId: string,
  employeeId: string,
): Promise<Employee> {
  const employee = await employees.findById(organizationId, employeeId);
  if (employee === undefined) {
    throw new EmployeeNotFoundError();
  }
  return employee;
}
