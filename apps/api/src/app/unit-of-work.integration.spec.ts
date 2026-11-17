import { type Database, PrismaService, runAtomically } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { DefineWeeklyCoverage } from '@trame/api/demand/application';
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
} from '@trame/api/organization/application';
import {
  PrismaPositionRepository,
  PrismaShiftTemplateRepository,
  PrismaSiteRepository,
  PrismaSkillRepository,
} from '@trame/api/organization/infrastructure';
import { CreateContract, CreateEmployee } from '@trame/api/staff/application';
import {
  PrismaContractRepository,
  PrismaEmployeeRepository,
} from '@trame/api/staff/infrastructure';
import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { SiteCatalogAdapter } from './demand/site-catalog.adapter';
import { OrganizationCatalogAdapter } from './staff/organization-catalog.adapter';

const ORGANIZATION_COMMITTED = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_CANCELLED = '0190f0a0-0000-7000-8000-00000000000b';
const OPTIONS = { timeoutMs: 10_000 };
const date = (text: string): Temporal.PlainDate => Temporal.PlainDate.from(text);
const time = (text: string): Temporal.PlainTime => Temporal.PlainTime.from(text);

class LatePanic extends Error {
  constructor() {
    super('Panne après la dernière écriture');
  }
}

/** Use cases d'écriture des trois contextes, assemblés comme dans l'application. */
interface Writers {
  createSite: CreateSite;
  createSkill: CreateSkill;
  createPosition: CreatePosition;
  createShiftTemplate: CreateShiftTemplate;
  createEmployee: CreateEmployee;
  createContract: CreateContract;
  defineWeeklyCoverage: DefineWeeklyCoverage;
}

function assembleWriters(database: Database, ids: SequentialIdGenerator): Writers {
  const clock = new FixedClock('2026-11-17T08:00:00Z');
  const sites = new PrismaSiteRepository(database);
  const skills = new PrismaSkillRepository(database);
  const positions = new PrismaPositionRepository(database);
  const shiftTemplates = new PrismaShiftTemplateRepository(database);
  const employees = new PrismaEmployeeRepository(database);
  const contracts = new PrismaContractRepository(database);
  const coverages = new PrismaWeeklyCoverageRepository(database);

  const getSite = new GetSite(sites);
  const organizationCatalog = new OrganizationCatalogAdapter(getSite, new GetSkill(skills));
  const siteCatalog = new SiteCatalogAdapter(
    getSite,
    new GetShiftTemplate(sites, shiftTemplates),
    new GetPosition(sites, positions),
  );

  return {
    createSite: new CreateSite(sites, clock, ids),
    createSkill: new CreateSkill(skills, clock, ids),
    createPosition: new CreatePosition(sites, skills, positions, clock, ids),
    createShiftTemplate: new CreateShiftTemplate(sites, shiftTemplates, clock, ids),
    createEmployee: new CreateEmployee(organizationCatalog, employees, clock, ids),
    createContract: new CreateContract(employees, contracts, clock, ids),
    defineWeeklyCoverage: new DefineWeeklyCoverage(siteCatalog, coverages, clock),
  };
}

/**
 * Une écriture de chaque sorte, dans l'ordre d'un chargement. Chaque use case relit ce que les
 * précédents ont écrit : un poste ses compétences, un employé son site, un besoin son créneau.
 */
async function writeOneOfEach(writers: Writers, organizationId: string): Promise<void> {
  const site = await writers.createSite.execute({
    organizationId,
    code: 'DEMO',
    name: 'Entrepôt de démonstration',
    timeZone: 'Europe/Paris',
  });
  const skill = await writers.createSkill.execute({ organizationId, name: 'CACES R489 cat. 3' });
  const position = await writers.createPosition.execute({
    organizationId,
    siteId: site.id,
    name: 'Cariste',
    skillIds: [skill.id],
  });
  const morning = await writers.createShiftTemplate.execute({
    organizationId,
    siteId: site.id,
    label: 'Matin',
    start: time('06:00'),
    end: time('13:20'),
    break: { start: time('10:00'), durationMinutes: 20 },
  });
  const employee = await writers.createEmployee.execute({
    organizationId,
    siteId: site.id,
    firstName: 'Camille',
    lastName: 'Laurent',
    qualifications: [{ skillId: skill.id, expiresOn: undefined }],
  });
  await writers.createContract.execute({
    organizationId,
    employeeId: employee.id,
    weeklyMinutesMin: 28 * 60,
    weeklyMinutesMax: 35 * 60,
    startsOn: date('2026-11-17'),
    endsOn: undefined,
  });
  await writers.defineWeeklyCoverage.execute({
    organizationId,
    siteId: site.id,
    weekStartsOn: date('2026-11-23'),
    needs: [
      {
        date: date('2026-11-23'),
        shiftTemplateId: morning.id,
        positionId: position.id,
        requiredCount: 1,
      },
    ],
  });
}

describe('unité de travail entre organization, staff et demand (ADR-0038)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let ids: SequentialIdGenerator;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
    ids = new SequentialIdGenerator();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  /** Lignes de l'organisation dans chaque table écrite, relues hors de l'unité de travail. */
  async function rowsOf(organizationId: string): Promise<Record<string, number>> {
    const where = { where: { organizationId } };
    return {
      sites: await prisma.site.count(where),
      skills: await prisma.skill.count(where),
      positions: await prisma.position.count(where),
      positionSkills: await prisma.positionSkill.count(where),
      shiftTemplates: await prisma.shiftTemplate.count(where),
      employees: await prisma.employee.count(where),
      employeeQualifications: await prisma.employeeQualification.count(where),
      contracts: await prisma.contract.count(where),
      weeklyCoverages: await prisma.weeklyCoverage.count(where),
      coverageNeeds: await prisma.coverageNeed.count(where),
    };
  }

  function eachTable(count: number): Record<string, number> {
    return {
      sites: count,
      skills: count,
      positions: count,
      positionSkills: count,
      shiftTemplates: count,
      employees: count,
      employeeQualifications: count,
      contracts: count,
      weeklyCoverages: count,
      coverageNeeds: count,
    };
  }

  it('valide les écritures des trois schémas, que chaque use case relit dans la transaction', async () => {
    await runAtomically(prisma, OPTIONS, async (unit) => {
      await writeOneOfEach(assembleWriters(unit, ids), ORGANIZATION_COMMITTED);
    });

    await expect(rowsOf(ORGANIZATION_COMMITTED)).resolves.toEqual(eachTable(1));
  });

  it('annule les écritures des trois schémas quand une erreur survient après la dernière', async () => {
    const loading = runAtomically(prisma, OPTIONS, async (unit) => {
      await writeOneOfEach(assembleWriters(unit, ids), ORGANIZATION_CANCELLED);
      throw new LatePanic();
    });

    await expect(loading).rejects.toThrow(LatePanic);
    await expect(rowsOf(ORGANIZATION_CANCELLED)).resolves.toEqual(eachTable(0));
  });
});
