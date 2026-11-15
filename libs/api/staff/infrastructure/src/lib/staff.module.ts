import { type DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';
import {
  CreateEmployee,
  type EmployeeRepository,
  GetEmployee,
  ListEmployees,
  type OrganizationCatalog,
} from '@trame/api/staff/application';
import { CLOCK, type Clock } from '@trame/platform/clock';
import { ID_GENERATOR, type IdGenerator } from '@trame/platform/ids';
import { EmployeesController } from './http/employees.controller';
import { EMPLOYEE_REPOSITORY, ORGANIZATION_CATALOG } from './injection-tokens';
import { PrismaEmployeeRepository } from './persistence/prisma-employee.repository';

type ImportedModule = NonNullable<ModuleMetadata['imports']>[number];

export interface StaffModuleOptions {
  /** Module de l'application qui fournit et exporte le port `ORGANIZATION_CATALOG`. */
  organizationCatalog: ImportedModule;
}

/**
 * Contexte `staff` : employés et habilitations (US-031). Les use cases sont des classes sans
 * framework : ce module les assemble avec leurs dépendances.
 * Requiert `DatabaseModule`, `ClockModule`, `IdsModule` et `AuthModule` dans l'application.
 */
@Module({})
export class StaffModule {
  static forRoot(options: StaffModuleOptions): DynamicModule {
    return {
      module: StaffModule,
      imports: [options.organizationCatalog],
      controllers: [EmployeesController],
      providers: [
        { provide: EMPLOYEE_REPOSITORY, useClass: PrismaEmployeeRepository },
        {
          provide: CreateEmployee,
          inject: [ORGANIZATION_CATALOG, EMPLOYEE_REPOSITORY, CLOCK, ID_GENERATOR],
          useFactory: (
            catalog: OrganizationCatalog,
            employees: EmployeeRepository,
            clock: Clock,
            ids: IdGenerator,
          ) => new CreateEmployee(catalog, employees, clock, ids),
        },
        {
          provide: GetEmployee,
          inject: [EMPLOYEE_REPOSITORY],
          useFactory: (employees: EmployeeRepository) => new GetEmployee(employees),
        },
        {
          provide: ListEmployees,
          inject: [ORGANIZATION_CATALOG, EMPLOYEE_REPOSITORY],
          useFactory: (catalog: OrganizationCatalog, employees: EmployeeRepository) =>
            new ListEmployees(catalog, employees),
        },
      ],
      // Use case public : d'autres parties de l'application créent des employés par lui.
      exports: [CreateEmployee],
    };
  }
}
