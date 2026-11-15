import { Employee, type Qualification } from '@trame/api/staff/domain';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import { ensureSiteExists } from '../ensure-site-exists';
import { SkillNotFoundError } from '../not-found.errors';
import type { EmployeeRepository } from '../ports/employee.repository';
import type { OrganizationCatalog } from '../ports/organization-catalog';

export interface CreateEmployeeCommand {
  organizationId: string;
  siteId: string;
  firstName: string;
  lastName: string;
  qualifications: readonly Qualification[];
}

/**
 * Enregistre un employé sur un site de l'organisation, avec ses habilitations. Un site ou une
 * compétence absents, ou d'une autre organisation, donnent la même erreur « introuvable ».
 */
export class CreateEmployee {
  constructor(
    private readonly catalog: OrganizationCatalog,
    private readonly employees: EmployeeRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateEmployeeCommand): Promise<Employee> {
    await ensureSiteExists(this.catalog, command.organizationId, command.siteId);
    const employee = Employee.create({
      ...command,
      id: this.ids.next(),
      createdAt: this.clock.now(),
    });
    const skillIds = employee.qualifications.map((qualification) => qualification.skillId);
    const skillsExist = await this.catalog.hasAllSkills(command.organizationId, skillIds);
    if (!skillsExist) {
      throw new SkillNotFoundError();
    }
    await this.employees.add(employee);
    return employee;
  }
}
