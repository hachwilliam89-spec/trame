import { type DynamicModule, Module, type ModuleMetadata, type Provider } from '@nestjs/common';
import {
  type AbsenceRepository,
  type ContractRepository,
  CreateContract,
  CreateEmployee,
  DeclareAbsence,
  DeleteAbsence,
  type EmployeeRepository,
  GetEmployee,
  ListContracts,
  ListEmployees,
  ListWeekAbsences,
  type OrganizationCatalog,
  UpdateAbsence,
} from '@trame/api/staff/application';
import { CLOCK, type Clock } from '@trame/platform/clock';
import { ID_GENERATOR, type IdGenerator } from '@trame/platform/ids';
import { AbsencesController } from './http/absences.controller';
import { EmployeeAbsencesController } from './http/employee-absences.controller';
import { EmployeesController } from './http/employees.controller';
import { EmploymentContractsController } from './http/employment-contracts.controller';
import {
  ABSENCE_REPOSITORY,
  CONTRACT_REPOSITORY,
  EMPLOYEE_REPOSITORY,
  ORGANIZATION_CATALOG,
} from './injection-tokens';
import { PrismaAbsenceRepository } from './persistence/prisma-absence.repository';
import { PrismaContractRepository } from './persistence/prisma-contract.repository';
import { PrismaEmployeeRepository } from './persistence/prisma-employee.repository';

type ImportedModule = NonNullable<ModuleMetadata['imports']>[number];

/** Use cases des absences (US-033). */
const absenceProviders: Provider[] = [
  {
    provide: DeclareAbsence,
    inject: [EMPLOYEE_REPOSITORY, ABSENCE_REPOSITORY, CLOCK, ID_GENERATOR],
    useFactory: (
      employees: EmployeeRepository,
      absences: AbsenceRepository,
      clock: Clock,
      ids: IdGenerator,
    ) => new DeclareAbsence(employees, absences, clock, ids),
  },
  {
    provide: UpdateAbsence,
    inject: [ABSENCE_REPOSITORY],
    useFactory: (absences: AbsenceRepository) => new UpdateAbsence(absences),
  },
  {
    provide: DeleteAbsence,
    inject: [ABSENCE_REPOSITORY],
    useFactory: (absences: AbsenceRepository) => new DeleteAbsence(absences),
  },
  {
    provide: ListWeekAbsences,
    inject: [ORGANIZATION_CATALOG, ABSENCE_REPOSITORY],
    useFactory: (catalog: OrganizationCatalog, absences: AbsenceRepository) =>
      new ListWeekAbsences(catalog, absences),
  },
];

export interface StaffModuleOptions {
  /** Module de l'application qui fournit et exporte le port `ORGANIZATION_CATALOG`. */
  organizationCatalog: ImportedModule;
}

/**
 * Contexte `staff` : employés, habilitations (US-031), contrats de travail (US-032) et absences
 * (US-033). Les use cases sont des classes sans framework : ce module les assemble avec leurs
 * dépendances.
 * Requiert `DatabaseModule`, `ClockModule`, `IdsModule` et `AuthModule` dans l'application.
 */
@Module({})
export class StaffModule {
  static forRoot(options: StaffModuleOptions): DynamicModule {
    return {
      module: StaffModule,
      imports: [options.organizationCatalog],
      controllers: [
        EmployeesController,
        EmploymentContractsController,
        EmployeeAbsencesController,
        AbsencesController,
      ],
      providers: [
        { provide: EMPLOYEE_REPOSITORY, useClass: PrismaEmployeeRepository },
        { provide: CONTRACT_REPOSITORY, useClass: PrismaContractRepository },
        { provide: ABSENCE_REPOSITORY, useClass: PrismaAbsenceRepository },
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
        {
          provide: CreateContract,
          inject: [EMPLOYEE_REPOSITORY, CONTRACT_REPOSITORY, CLOCK, ID_GENERATOR],
          useFactory: (
            employees: EmployeeRepository,
            contracts: ContractRepository,
            clock: Clock,
            ids: IdGenerator,
          ) => new CreateContract(employees, contracts, clock, ids),
        },
        {
          provide: ListContracts,
          inject: [EMPLOYEE_REPOSITORY, CONTRACT_REPOSITORY],
          useFactory: (employees: EmployeeRepository, contracts: ContractRepository) =>
            new ListContracts(employees, contracts),
        },
        ...absenceProviders,
      ],
      // Use cases publics : d'autres parties de l'application créent et lisent des employés et
      // leurs contrats par eux.
      exports: [CreateEmployee, CreateContract, ListEmployees, ListContracts],
    };
  }
}
