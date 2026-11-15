import type { INestApplication } from '@nestjs/common';
import type { Employee } from '@trame/api/staff/domain';
import {
  ORGANIZATION_A,
  ORGANIZATION_B,
  type StaffTestApp,
  createStaffTestApp,
  getAs,
  testActors,
} from '../../testing/staff-test-app';

const WAREHOUSE_OF_A = '0190f0a0-0000-7000-8000-0000000000d1';
const WAREHOUSE_OF_B = '0190f0a0-0000-7000-8000-0000000000d3';
const CACES_CATEGORY_3 = '0190f0a0-0000-7000-8000-0000000000c3';
const CACES_CATEGORY_5 = '0190f0a0-0000-7000-8000-0000000000c5';
const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';

/** `instance` reprend le chemin demandé : c'est le seul champ qui distingue deux réponses 404. */
function withoutInstance(problem: Record<string, unknown>): Record<string, unknown> {
  return { ...problem, instance: undefined };
}

describe('API des employés (US-031, jalon 1)', () => {
  let testApp: StaffTestApp;
  let app: INestApplication;

  beforeEach(async () => {
    testApp = await createStaffTestApp();
    app = testApp.app;
    testApp.catalog.addSite(ORGANIZATION_A, WAREHOUSE_OF_A);
    testApp.catalog.addSkill(ORGANIZATION_A, CACES_CATEGORY_3);
    testApp.catalog.addSkill(ORGANIZATION_A, CACES_CATEGORY_5);
    testApp.catalog.addSite(ORGANIZATION_B, WAREHOUSE_OF_B);
  });
  afterEach(async () => {
    await app.close();
  });

  async function createForkliftDriver(firstName = 'Camille'): Promise<Employee> {
    return testApp.createEmployee.execute({
      organizationId: ORGANIZATION_A,
      siteId: WAREHOUSE_OF_A,
      firstName,
      lastName: 'Martin',
      qualifications: [
        { skillId: CACES_CATEGORY_3, expiresOn: Temporal.PlainDate.from('2026-12-09') },
        { skillId: CACES_CATEGORY_5, expiresOn: undefined },
      ],
    });
  }

  it('renvoie un employé avec ses habilitations et leur date d’expiration', async () => {
    const employee = await createForkliftDriver();

    const response = await getAs(app, testActors.managerOfA, `/employees/${employee.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: employee.id,
      siteId: WAREHOUSE_OF_A,
      firstName: 'Camille',
      lastName: 'Martin',
      qualifications: [
        { skillId: CACES_CATEGORY_3, expiresOn: '2026-12-09' },
        { skillId: CACES_CATEGORY_5, expiresOn: null },
      ],
      createdAt: '2026-11-15T08:00:00Z',
    });
  });

  it('liste les employés d’un site, page par page', async () => {
    const first = await createForkliftDriver('Camille');
    const second = await createForkliftDriver('Samir');
    const path = `/employees?siteId=${WAREHOUSE_OF_A}&limit=1`;

    const firstPage = await getAs(app, testActors.adminOfA, path);
    const lastPage = await getAs(app, testActors.adminOfA, `${path}&cursor=${first.id}`);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items.map((item: { id: string }) => item.id)).toEqual([first.id]);
    expect(firstPage.body.nextCursor).toBe(first.id);
    expect(lastPage.body.items.map((item: { id: string }) => item.id)).toEqual([second.id]);
    expect(lastPage.body.nextCursor).toBeNull();
  });

  it('BDD isolation : un employé d’une autre organisation est indiscernable d’un employé absent', async () => {
    const employee = await createForkliftDriver();

    const foreign = await getAs(app, testActors.managerOfB, `/employees/${employee.id}`);
    const missing = await getAs(app, testActors.managerOfB, `/employees/${UNKNOWN_ID}`);

    expect(foreign.status).toBe(404);
    expect(withoutInstance(foreign.body)).toEqual(withoutInstance(missing.body));
  });

  it('BDD isolation : le site d’une autre organisation est indiscernable d’un site absent', async () => {
    await createForkliftDriver();

    const foreign = await getAs(app, testActors.managerOfB, `/employees?siteId=${WAREHOUSE_OF_A}`);
    const missing = await getAs(app, testActors.managerOfB, `/employees?siteId=${UNKNOWN_ID}`);

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it('ne montre à un manager que les employés de son organisation', async () => {
    await createForkliftDriver();

    const response = await getAs(app, testActors.managerOfB, `/employees?siteId=${WAREHOUSE_OF_B}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  it('traite un identifiant mal formé comme une ressource absente', async () => {
    const response = await getAs(app, testActors.managerOfA, '/employees/camille');

    expect(response.status).toBe(404);
  });

  it('exige un site bien formé pour lister les employés', async () => {
    const withoutSite = await getAs(app, testActors.managerOfA, '/employees');
    const malformedSite = await getAs(app, testActors.managerOfA, '/employees?siteId=entrepot');

    expect(withoutSite.status).toBe(400);
    expect(malformedSite.status).toBe(400);
  });

  it('refuse un employé, qui ne consulte pas la liste du personnel, et un anonyme', async () => {
    const employee = await createForkliftDriver();
    const paths = [`/employees/${employee.id}`, `/employees?siteId=${WAREHOUSE_OF_A}`];

    for (const path of paths) {
      expect((await getAs(app, testActors.employeeOfA, path)).status).toBe(403);
      expect((await getAs(app, undefined, path)).status).toBe(401);
    }
  });
});
