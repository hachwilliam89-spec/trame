import type { Database } from '@trame/api/database';
import {
  DefineWeeklyCoverage,
  type SiteCatalog,
  type WeeklyCoverageRepository,
} from '@trame/api/demand/application';
import { PrismaWeeklyCoverageRepository } from '@trame/api/demand/infrastructure';
import {
  CreatePosition,
  CreateShiftTemplate,
  CreateSite,
  CreateSkill,
  GetPosition,
  GetShiftTemplate,
  GetSite,
  GetSkill,
  ListSites,
  type PositionRepository,
  type ShiftTemplateRepository,
  type SiteRepository,
  type SkillRepository,
} from '@trame/api/organization/application';
import {
  PrismaPositionRepository,
  PrismaShiftTemplateRepository,
  PrismaSiteRepository,
  PrismaSkillRepository,
} from '@trame/api/organization/infrastructure';
import {
  type ContractRepository,
  CreateContract,
  CreateEmployee,
  type EmployeeRepository,
  type OrganizationCatalog,
} from '@trame/api/staff/application';
import {
  PrismaContractRepository,
  PrismaEmployeeRepository,
} from '@trame/api/staff/infrastructure';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import { SiteCatalogAdapter } from '../demand/site-catalog.adapter';
import { OrganizationCatalogAdapter } from '../staff/organization-catalog.adapter';

/** Dépôts des trois contextes qu'un chargement remplit. */
export interface DemoRepositories {
  sites: SiteRepository;
  skills: SkillRepository;
  positions: PositionRepository;
  shiftTemplates: ShiftTemplateRepository;
  employees: EmployeeRepository;
  contracts: ContractRepository;
  coverages: WeeklyCoverageRepository;
}

/** Use cases publics d'`organization`, `staff` et `demand` qu'un chargement appelle. */
export interface DemoLoadingSteps {
  listSites: ListSites;
  createSite: CreateSite;
  createSkill: CreateSkill;
  createPosition: CreatePosition;
  createShiftTemplate: CreateShiftTemplate;
  createEmployee: CreateEmployee;
  createContract: CreateContract;
  defineWeeklyCoverage: DefineWeeklyCoverage;
}

/** Les dépôts PostgreSQL, tous sur la même base : celle d'une unité de travail (ADR-0038). */
export function prismaDemoRepositories(database: Database): DemoRepositories {
  return {
    sites: new PrismaSiteRepository(database),
    skills: new PrismaSkillRepository(database),
    positions: new PrismaPositionRepository(database),
    shiftTemplates: new PrismaShiftTemplateRepository(database),
    employees: new PrismaEmployeeRepository(database),
    contracts: new PrismaContractRepository(database),
    coverages: new PrismaWeeklyCoverageRepository(database),
  };
}

/**
 * Assemble les use cases comme l'application Nest, adaptateurs entre contextes compris : chaque
 * use case relit ce que les précédents ont écrit par les mêmes dépôts.
 */
export function assembleDemoLoadingSteps(
  repositories: DemoRepositories,
  clock: Clock,
  ids: IdGenerator,
): DemoLoadingSteps {
  const { sites, skills, positions, shiftTemplates, employees, contracts, coverages } =
    repositories;
  const getSite = new GetSite(sites);
  const organizationCatalog: OrganizationCatalog = new OrganizationCatalogAdapter(
    getSite,
    new GetSkill(skills),
  );
  const siteCatalog: SiteCatalog = new SiteCatalogAdapter(
    getSite,
    new GetShiftTemplate(sites, shiftTemplates),
    new GetPosition(sites, positions),
  );

  return {
    listSites: new ListSites(sites),
    createSite: new CreateSite(sites, clock, ids),
    createSkill: new CreateSkill(skills, clock, ids),
    createPosition: new CreatePosition(sites, skills, positions, clock, ids),
    createShiftTemplate: new CreateShiftTemplate(sites, shiftTemplates, clock, ids),
    createEmployee: new CreateEmployee(organizationCatalog, employees, clock, ids),
    createContract: new CreateContract(employees, contracts, clock, ids),
    defineWeeklyCoverage: new DefineWeeklyCoverage(siteCatalog, coverages, clock),
  };
}
