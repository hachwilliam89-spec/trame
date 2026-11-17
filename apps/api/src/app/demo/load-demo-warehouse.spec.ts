import { InMemoryWeeklyCoverageRepository } from '@trame/api/demand/application/testing';
import {
  InMemoryPositionRepository,
  InMemoryShiftTemplateRepository,
  InMemorySiteRepository,
  InMemorySkillRepository,
} from '@trame/api/organization/application/testing';
import {
  InMemoryContractRepository,
  InMemoryEmployeeRepository,
} from '@trame/api/staff/application/testing';
import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { type DemoRepositories, assembleDemoLoadingSteps } from './demo-loading-steps';
import {
  DemoAlreadyLoadedError,
  type DemoUnitOfWork,
  LoadDemoWarehouse,
} from './load-demo-warehouse';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const ALL = { limit: 100 };

describe('LoadDemoWarehouse', () => {
  let repositories: DemoRepositories;
  let loadDemoWarehouse: LoadDemoWarehouse;

  beforeEach(() => {
    repositories = {
      sites: new InMemorySiteRepository(),
      skills: new InMemorySkillRepository(),
      positions: new InMemoryPositionRepository(),
      shiftTemplates: new InMemoryShiftTemplateRepository(),
      employees: new InMemoryEmployeeRepository(),
      contracts: new InMemoryContractRepository(),
      coverages: new InMemoryWeeklyCoverageRepository(),
    };
    // Mardi 17 novembre 2026 à Paris : la semaine de démonstration commence le lundi 23.
    const clock = new FixedClock('2026-11-17T08:00:00Z');
    const steps = assembleDemoLoadingSteps(repositories, clock, new SequentialIdGenerator());
    const unitOfWork: DemoUnitOfWork = { run: (_organizationId, work) => work(steps) };
    loadDemoWarehouse = new LoadDemoWarehouse(unitOfWork, clock);
  });

  it('charge l’entrepôt dans une organisation sans site, pour le lundi suivant', async () => {
    const loaded = await loadDemoWarehouse.execute(ORGANIZATION_A);

    const { siteId, weekStartsOn } = loaded;
    expect(weekStartsOn).toEqual(Temporal.PlainDate.from('2026-11-23'));
    expect((await repositories.sites.list(ORGANIZATION_A, ALL)).items).toHaveLength(1);
    expect((await repositories.skills.list(ORGANIZATION_A, ALL)).items).toHaveLength(3);
    expect(
      (await repositories.positions.listBySite(ORGANIZATION_A, siteId, ALL)).items,
    ).toHaveLength(3);
    expect(
      (await repositories.shiftTemplates.listBySite(ORGANIZATION_A, siteId, ALL)).items,
    ).toHaveLength(2);
    const employees = (await repositories.employees.listBySite(ORGANIZATION_A, siteId, ALL)).items;
    expect(employees).toHaveLength(12);
    for (const employee of employees) {
      const contracts = await repositories.contracts.listByEmployee(
        ORGANIZATION_A,
        employee.id,
        ALL,
      );
      expect(contracts.items).toHaveLength(1);
    }
    const coverage = await repositories.coverages.find(ORGANIZATION_A, siteId, weekStartsOn);
    const places = coverage?.needs.reduce((total, need) => total + need.requiredCount, 0);
    expect(places).toBe(51);
  });

  it('refuse sans rien écrire quand l’organisation a déjà un site', async () => {
    await loadDemoWarehouse.execute(ORGANIZATION_A);

    await expect(loadDemoWarehouse.execute(ORGANIZATION_A)).rejects.toThrow(DemoAlreadyLoadedError);
    expect((await repositories.sites.list(ORGANIZATION_A, ALL)).items).toHaveLength(1);
    expect((await repositories.skills.list(ORGANIZATION_A, ALL)).items).toHaveLength(3);
  });

  it('le site d’une autre organisation n’empêche pas le chargement', async () => {
    await loadDemoWarehouse.execute(ORGANIZATION_B);

    await loadDemoWarehouse.execute(ORGANIZATION_A);

    expect((await repositories.sites.list(ORGANIZATION_A, ALL)).items).toHaveLength(1);
    expect((await repositories.sites.list(ORGANIZATION_B, ALL)).items).toHaveLength(1);
  });
});
