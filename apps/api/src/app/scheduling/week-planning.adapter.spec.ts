import { DefineWeeklyCoverage, GetWeeklyCoverage } from '@trame/api/demand/application';
import {
  InMemorySiteCatalog,
  InMemoryWeeklyCoverageRepository,
} from '@trame/api/demand/application/testing';
import {
  CreatePosition,
  CreateShiftTemplate,
  CreateSite,
  CreateSkill,
  GetPosition,
  GetShiftTemplateDurations,
  GetSite,
} from '@trame/api/organization/application';
import {
  InMemoryPositionRepository,
  InMemoryShiftTemplateRepository,
  InMemorySiteRepository,
  InMemorySkillRepository,
} from '@trame/api/organization/application/testing';
import {
  CreateContract,
  CreateEmployee,
  ListContracts,
  ListEmployees,
} from '@trame/api/staff/application';
import {
  InMemoryContractRepository,
  InMemoryEmployeeRepository,
  InMemoryOrganizationCatalog,
} from '@trame/api/staff/application/testing';
import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { OrganizationPlanningReader } from './organization-planning.reader';
import { StaffPlanningReader } from './staff-planning.reader';
import { WeekPlanningAdapter } from './week-planning.adapter';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const MONDAY = Temporal.PlainDate.from('2026-11-23');
const clock = new FixedClock(Temporal.Instant.from('2026-11-15T08:00:00Z'));

async function setUp() {
  const ids = new SequentialIdGenerator();
  const sites = new InMemorySiteRepository();
  const skills = new InMemorySkillRepository();
  const positions = new InMemoryPositionRepository();
  const shiftTemplates = new InMemoryShiftTemplateRepository();
  const site = await new CreateSite(sites, clock, ids).execute({
    organizationId: ORGANIZATION_A,
    code: 'DEMO',
    name: 'Entrepôt de démonstration',
    timeZone: 'Europe/Paris',
  });
  const caces = await new CreateSkill(skills, clock, ids).execute({
    organizationId: ORGANIZATION_A,
    name: 'CACES R489 catégorie 3',
  });
  const forklift = await new CreatePosition(sites, skills, positions, clock, ids).execute({
    organizationId: ORGANIZATION_A,
    siteId: site.id,
    name: 'Cariste',
    skillIds: [caces.id],
  });
  const morning = await new CreateShiftTemplate(sites, shiftTemplates, clock, ids).execute({
    organizationId: ORGANIZATION_A,
    siteId: site.id,
    label: 'Matin',
    start: Temporal.PlainTime.from('06:00'),
    end: Temporal.PlainTime.from('13:20'),
    break: { start: Temporal.PlainTime.from('10:00'), durationMinutes: 20 },
  });

  const siteCatalog = new InMemorySiteCatalog();
  siteCatalog.addSite(ORGANIZATION_A, site.id);
  siteCatalog.addShiftTemplate(ORGANIZATION_A, site.id, morning.id);
  siteCatalog.addPosition(ORGANIZATION_A, site.id, forklift.id);
  const coverages = new InMemoryWeeklyCoverageRepository();
  await new DefineWeeklyCoverage(siteCatalog, coverages, clock).execute({
    organizationId: ORGANIZATION_A,
    siteId: site.id,
    weekStartsOn: MONDAY,
    needs: [
      {
        date: MONDAY,
        shiftTemplateId: morning.id,
        positionId: forklift.id,
        requiredCount: 2,
      },
    ],
  });

  const organizationCatalog = new InMemoryOrganizationCatalog();
  organizationCatalog.addSite(ORGANIZATION_A, site.id);
  organizationCatalog.addSkill(ORGANIZATION_A, caces.id);
  const employees = new InMemoryEmployeeRepository();
  const contracts = new InMemoryContractRepository();
  const createEmployee = new CreateEmployee(organizationCatalog, employees, clock, ids);
  const driver = await createEmployee.execute({
    organizationId: ORGANIZATION_A,
    siteId: site.id,
    firstName: 'Camille',
    lastName: 'Martin',
    qualifications: [{ skillId: caces.id, expiresOn: Temporal.PlainDate.from('2026-11-25') }],
  });
  await new CreateContract(employees, contracts, clock, ids).execute({
    organizationId: ORGANIZATION_A,
    employeeId: driver.id,
    weeklyMinutesMin: 1680,
    weeklyMinutesMax: 2100,
    startsOn: Temporal.PlainDate.from('2026-01-05'),
    endsOn: undefined,
  });

  const adapter = new WeekPlanningAdapter(
    new OrganizationPlanningReader(
      new GetSite(sites),
      new GetPosition(sites, positions),
      new GetShiftTemplateDurations(sites, shiftTemplates),
    ),
    new StaffPlanningReader(
      new ListEmployees(organizationCatalog, employees),
      new ListContracts(employees, contracts),
    ),
    new GetWeeklyCoverage(siteCatalog, coverages),
  );
  return { adapter, site, caces, forklift, morning, driver };
}

describe('Lecture d’une semaine pour la génération (organization, demand, staff)', () => {
  it('assemble les besoins, leurs horaires dans le fuseau du site et les salariés', async () => {
    const { adapter, site, caces, forklift, morning, driver } = await setUp();

    const planning = await adapter.read(ORGANIZATION_A, site.id, MONDAY);

    expect(planning).toMatchObject({ siteId: site.id, timeZone: 'Europe/Paris' });
    expect(planning?.shifts).toHaveLength(1);
    const [shift] = planning?.shifts ?? [];
    expect(shift).toMatchObject({
      shiftTemplateId: morning.id,
      positionId: forklift.id,
      effectiveMinutes: 420,
      requiredSkillIds: [caces.id],
      requiredCount: 2,
    });
    expect(shift?.date.equals(MONDAY)).toBe(true);
    expect(shift?.startsAt.equals(Temporal.Instant.from('2026-11-23T05:00:00Z'))).toBe(true);
    expect(shift?.endsAt.equals(Temporal.Instant.from('2026-11-23T12:20:00Z'))).toBe(true);
    expect(planning?.employees).toHaveLength(1);
    expect(planning?.employees[0]).toMatchObject({
      id: driver.id,
      qualifications: [{ skillId: caces.id }],
      contracts: [{ weeklyMinutesMin: 1680, weeklyMinutesMax: 2100, endsOn: undefined }],
    });
  });

  it('rend une semaine sans besoin quand aucun besoin n’a été défini', async () => {
    const { adapter, site } = await setUp();

    const planning = await adapter.read(ORGANIZATION_A, site.id, MONDAY.add({ weeks: 1 }));

    expect(planning?.shifts).toEqual([]);
  });

  it('ne connaît pas le site d’une autre organisation', async () => {
    const { adapter, site } = await setUp();

    expect(await adapter.read(ORGANIZATION_B, site.id, MONDAY)).toBeUndefined();
    expect(await adapter.hasSite(ORGANIZATION_B, site.id)).toBe(false);
    expect(await adapter.hasSite(ORGANIZATION_A, site.id)).toBe(true);
  });
});
