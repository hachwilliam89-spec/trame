import { Injectable } from '@nestjs/common';
import { type Prisma, PrismaService, dateToInstant, instantToDate } from '@trame/api/database';
import type { EmployeeRepository } from '@trame/api/staff/application';
import { Employee } from '@trame/api/staff/domain';
import { type Page, type PageRequest, pageFrom } from '@trame/platform/pagination';
import { afterCursor } from './after-cursor';
import { optionalDateToPlainDate, optionalPlainDateToDate } from './optional-date-conversions';

type EmployeeRecord = Prisma.EmployeeModel & {
  qualifications: { skillId: string; expiresOn: Date | null }[];
};

/** Employés dans `staff.employees`, et leurs habilitations dans `employee_qualifications`. */
@Injectable()
export class PrismaEmployeeRepository implements EmployeeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async add(employee: Employee): Promise<void> {
    const qualifications = employee.qualifications.map((qualification) => ({
      employeeId: employee.id,
      organizationId: employee.organizationId,
      skillId: qualification.skillId,
      expiresOn: optionalPlainDateToDate(qualification.expiresOn),
    }));
    // Les identifiants sont déjà attribués : les deux écritures partagent la même transaction.
    await this.prisma.$transaction([
      this.prisma.employee.create({
        data: {
          id: employee.id,
          organizationId: employee.organizationId,
          siteId: employee.siteId,
          firstName: employee.firstName,
          lastName: employee.lastName,
          createdAt: instantToDate(employee.createdAt),
        },
      }),
      this.prisma.employeeQualification.createMany({ data: qualifications }),
    ]);
  }

  async findById(organizationId: string, employeeId: string): Promise<Employee | undefined> {
    const record = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      include: qualificationsOf(organizationId),
    });
    if (record === null) {
      return undefined;
    }
    return toEmployee(record);
  }

  async listBySite(
    organizationId: string,
    siteId: string,
    page: PageRequest,
  ): Promise<Page<Employee>> {
    const records = await this.prisma.employee.findMany({
      where: { organizationId, siteId, id: afterCursor(page.after) },
      include: qualificationsOf(organizationId),
      orderBy: { id: 'asc' },
      take: page.limit + 1,
    });
    return pageFrom(records.map(toEmployee), page.limit);
  }
}

/** Les habilitations sont lues avec le même filtre d'organisation que l'employé. */
function qualificationsOf(organizationId: string) {
  return {
    qualifications: { where: { organizationId }, select: { skillId: true, expiresOn: true } },
  };
}

function toEmployee(record: EmployeeRecord): Employee {
  return Employee.create({
    id: record.id,
    organizationId: record.organizationId,
    siteId: record.siteId,
    firstName: record.firstName,
    lastName: record.lastName,
    qualifications: record.qualifications.map((qualification) => ({
      skillId: qualification.skillId,
      expiresOn: optionalDateToPlainDate(qualification.expiresOn),
    })),
    createdAt: dateToInstant(record.createdAt),
  });
}
