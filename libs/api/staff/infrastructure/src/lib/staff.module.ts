import { type DynamicModule, Module, type ModuleMetadata, type Provider } from '@nestjs/common';
import {
  type AbsenceRepository,
  type AbsenceWeekReferenceRepository,
  AbsenceWeekReferenceFreezer,
  type ContractRepository,
  CreateContract,
  CreateEmployee,
  DeclareAbsence,
  DeleteAbsence,
  type EmployeeRepository,
  GetEmployee,
  GetWeekAbsenceValuations,
  ListContracts,
  ListEmployees,
  ListWeekAbsences,
  type OrganizationCatalog,
  type PlanningReferenceSource,
  SetAbsenceDayValuation,
  UpdateAbsence,
} from '@trame/api/staff/application';
import { CLOCK, type Clock } from '@trame/platform/clock';
import { ID_GENERATOR, type IdGenerator } from '@trame/platform/ids';
import { AbsenceValuationsController } from './http/absence-valuations.controller';
import { AbsencesController } from './http/absences.controller';
import { EmployeeAbsencesController } from './http/employee-absences.controller';
import { EmployeesController } from './http/employees.controller';
import { EmploymentContractsController } from './http/employment-contracts.controller';
import {
  ABSENCE_REPOSITORY,
  ABSENCE_WEEK_REFERENCE_REPOSITORY,
  CONTRACT_REPOSITORY,
  EMPLOYEE_REPOSITORY,
  ORGANIZATION_CATALOG,
  PLANNING_REFERENCE_SOURCE,
} from './injection-tokens';
import { PrismaAbsenceWeekReferenceRepository } from './persistence/prisma-absence-week-reference.repository';
import { PrismaAbsenceRepository } from './persistence/prisma-absence.repository';
import { PrismaContractRepository } from './persistence/prisma-contract.repository';
import { PrismaEmployeeRepository } from './persistence/prisma-employee.repository';

type ImportedModule = NonNullable<ModuleMetadata['imports']>[number];

/** Use cases des employés (US-031) et de leurs contrats (US-032). */
const employeeAndContractProviders: Provider[] = [
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
];

/** Use cases des absences et de leur valorisation (US-033). */
const absenceProviders: Provider[] = [
  {
    provide: AbsenceWeekReferenceFreezer,
    inject: [
      ORGANIZATION_CATALOG,
      CONTRACT_REPOSITORY,
      ABSENCE_WEEK_REFERENCE_REPOSITORY,
      PLANNING_REFERENCE_SOURCE,
    ],
    useFactory: (
      catalog: OrganizationCatalog,
      contracts: ContractRepository,
      references: AbsenceWeekReferenceRepository,
      source: PlanningReferenceSource,
    ) => new AbsenceWeekReferenceFreezer(catalog, contracts, references, source),
  },
  {
    provide: DeclareAbsence,
    inject: [
      EMPLOYEE_REPOSITORY,
      ABSENCE_REPOSITORY,
      AbsenceWeekReferenceFreezer,
      CLOCK,
      ID_GENERATOR,
    ],
    useFactory: (
      employees: EmployeeRepository,
      absences: AbsenceRepository,
      freezer: AbsenceWeekReferenceFreezer,
      clock: Clock,
      ids: IdGenerator,
    ) => new DeclareAbsence(employees, absences, freezer, clock, ids),
  },
  {
    provide: UpdateAbsence,
    inject: [EMPLOYEE_REPOSITORY, ABSENCE_REPOSITORY, AbsenceWeekReferenceFreezer, CLOCK],
    useFactory: (
      employees: EmployeeRepository,
      absences: AbsenceRepository,
      freezer: AbsenceWeekReferenceFreezer,
      clock: Clock,
    ) => new UpdateAbsence(employees, absences, freezer, clock),
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
  {
    provide: SetAbsenceDayValuation,
    inject: [EMPLOYEE_REPOSITORY, ABSENCE_WEEK_REFERENCE_REPOSITORY],
    useFactory: (employees: EmployeeRepository, references: AbsenceWeekReferenceRepository) =>
      new SetAbsenceDayValuation(employees, references),
  },
  {
    provide: GetWeekAbsenceValuations,
    inject: [ORGANIZATION_CATALOG, ABSENCE_REPOSITORY, ABSENCE_WEEK_REFERENCE_REPOSITORY],
    useFactory: (
      catalog: OrganizationCatalog,
      absences: AbsenceRepository,
      references: AbsenceWeekReferenceRepository,
    ) => new GetWeekAbsenceValuations(catalog, absences, references),
  },
];

export interface StaffModuleOptions {
  /** Module de l'application qui fournit et exporte le port `ORGANIZATION_CATALOG`. */
  organizationCatalog: ImportedModule;
  /** Module de l'application qui fournit et exporte le port `PLANNING_REFERENCE_SOURCE`. */
  planningReference: ImportedModule;
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
      imports: [options.organizationCatalog, options.planningReference],
      controllers: [
        EmployeesController,
        EmploymentContractsController,
        EmployeeAbsencesController,
        AbsencesController,
        AbsenceValuationsController,
      ],
      providers: [
        { provide: EMPLOYEE_REPOSITORY, useClass: PrismaEmployeeRepository },
        { provide: CONTRACT_REPOSITORY, useClass: PrismaContractRepository },
        { provide: ABSENCE_REPOSITORY, useClass: PrismaAbsenceRepository },
        {
          provide: ABSENCE_WEEK_REFERENCE_REPOSITORY,
          useClass: PrismaAbsenceWeekReferenceRepository,
        },
        ...employeeAndContractProviders,
        ...absenceProviders,
      ],
      // Use cases publics : d'autres parties de l'application créent et lisent des employés et
      // leurs contrats par eux.
      exports: [CreateEmployee, CreateContract, ListEmployees, ListContracts],
    };
  }
}
