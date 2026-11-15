import type { Employee } from '@trame/api/staff/domain';
import { EmployeeNotFoundError } from '../not-found.errors';
import type { EmployeeRepository } from '../ports/employee.repository';

export interface GetEmployeeQuery {
  organizationId: string;
  employeeId: string;
}

/** Lit un employé de l'organisation. */
export class GetEmployee {
  constructor(private readonly employees: EmployeeRepository) {}

  async execute(query: GetEmployeeQuery): Promise<Employee> {
    const employee = await this.employees.findById(query.organizationId, query.employeeId);
    if (employee === undefined) {
      throw new EmployeeNotFoundError();
    }
    return employee;
  }
}
