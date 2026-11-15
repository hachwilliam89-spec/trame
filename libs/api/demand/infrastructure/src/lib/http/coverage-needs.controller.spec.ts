import type { INestApplication } from '@nestjs/common';
import {
  type DemandTestApp,
  ORGANIZATION_A,
  createDemandTestApp,
  getAs,
  testActors,
} from '../../testing/demand-test-app';

const WAREHOUSE = '0190f0a0-0000-7000-8000-0000000000d1';
const MORNING = '0190f0a0-0000-7000-8000-0000000000a1';
const FORKLIFT_DRIVER = '0190f0a0-0000-7000-8000-0000000000b1';
const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';
const WEEK_PATH = `/coverage-needs?siteId=${WAREHOUSE}&weekStartsOn=2026-11-16`;

describe('API des besoins de couverture (US-050, jalon 1)', () => {
  let testApp: DemandTestApp;
  let app: INestApplication;

  beforeEach(async () => {
    testApp = await createDemandTestApp();
    app = testApp.app;
    testApp.catalog.addSite(ORGANIZATION_A, WAREHOUSE);
    testApp.catalog.addShiftTemplate(ORGANIZATION_A, WAREHOUSE, MORNING);
    testApp.catalog.addPosition(ORGANIZATION_A, WAREHOUSE, FORKLIFT_DRIVER);
  });
  afterEach(async () => {
    await app.close();
  });

  async function defineWeek(): Promise<void> {
    await testApp.defineWeeklyCoverage.execute({
      organizationId: ORGANIZATION_A,
      siteId: WAREHOUSE,
      weekStartsOn: Temporal.PlainDate.from('2026-11-16'),
      needs: [
        {
          date: Temporal.PlainDate.from('2026-11-21'),
          shiftTemplateId: MORNING,
          positionId: FORKLIFT_DRIVER,
          requiredCount: 3,
        },
        {
          date: Temporal.PlainDate.from('2026-11-16'),
          shiftTemplateId: MORNING,
          positionId: FORKLIFT_DRIVER,
          requiredCount: 2,
        },
      ],
    });
  }

  it('renvoie les besoins d’une semaine, triés par jour', async () => {
    await defineWeek();

    const response = await getAs(app, testActors.managerOfA, WEEK_PATH);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      siteId: WAREHOUSE,
      weekStartsOn: '2026-11-16',
      needs: [
        {
          date: '2026-11-16',
          shiftTemplateId: MORNING,
          positionId: FORKLIFT_DRIVER,
          requiredCount: 2,
        },
        {
          date: '2026-11-21',
          shiftTemplateId: MORNING,
          positionId: FORKLIFT_DRIVER,
          requiredCount: 3,
        },
      ],
      updatedAt: '2026-11-15T08:00:00Z',
    });
  });

  it('renvoie une grille vide pour une semaine jamais définie', async () => {
    const response = await getAs(app, testActors.adminOfA, WEEK_PATH);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      siteId: WAREHOUSE,
      weekStartsOn: '2026-11-16',
      needs: [],
      updatedAt: null,
    });
  });

  it('BDD isolation : le site d’une autre organisation est indiscernable d’un site absent', async () => {
    await defineWeek();
    const missingPath = `/coverage-needs?siteId=${UNKNOWN_ID}&weekStartsOn=2026-11-16`;

    const foreign = await getAs(app, testActors.managerOfB, WEEK_PATH);
    const missing = await getAs(app, testActors.managerOfB, missingPath);

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it.each([
    ['sans site', '/coverage-needs?weekStartsOn=2026-11-16'],
    ['sans semaine', `/coverage-needs?siteId=${WAREHOUSE}`],
    ['avec un jour mal formé', `/coverage-needs?siteId=${WAREHOUSE}&weekStartsOn=16-11-2026`],
    ['avec un mardi', `/coverage-needs?siteId=${WAREHOUSE}&weekStartsOn=2026-11-17`],
  ])('refuse une demande %s', async (_case, path) => {
    const response = await getAs(app, testActors.managerOfA, path);

    expect(response.status).toBe(400);
  });

  it('refuse un employé, qui ne consulte pas les besoins du site, et un anonyme', async () => {
    expect((await getAs(app, testActors.employeeOfA, WEEK_PATH)).status).toBe(403);
    expect((await getAs(app, undefined, WEEK_PATH)).status).toBe(401);
  });
});
