import type { INestApplication } from '@nestjs/common';
import type { Contract, Employee } from '@trame/api/staff/domain';
import {
  ORGANIZATION_A,
  type StaffTestApp,
  createStaffTestApp,
  getAs,
  testActors,
} from '../../testing/staff-test-app';

const WAREHOUSE_OF_A = '0190f0a0-0000-7000-8000-0000000000d1';
const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';

/** `instance` reprend le chemin demandé : c'est le seul champ qui distingue deux réponses 404. */
function withoutInstance(problem: Record<string, unknown>): Record<string, unknown> {
  return { ...problem, instance: undefined };
}

describe('API des contrats de travail (US-032, jalon 1)', () => {
  let testApp: StaffTestApp;
  let app: INestApplication;
  let camille: Employee;

  beforeEach(async () => {
    testApp = await createStaffTestApp();
    app = testApp.app;
    testApp.catalog.addSite(ORGANIZATION_A, WAREHOUSE_OF_A);
    camille = await testApp.createEmployee.execute({
      organizationId: ORGANIZATION_A,
      siteId: WAREHOUSE_OF_A,
      firstName: 'Camille',
      lastName: 'Martin',
      qualifications: [],
    });
  });
  afterEach(async () => {
    await app.close();
  });

  async function createContract(startsOn: string, endsOn?: string): Promise<Contract> {
    return testApp.createContract.execute({
      organizationId: ORGANIZATION_A,
      employeeId: camille.id,
      weeklyMinutesMin: 1680,
      weeklyMinutesMax: 2100,
      startsOn: Temporal.PlainDate.from(startsOn),
      endsOn: endsOn === undefined ? undefined : Temporal.PlainDate.from(endsOn),
    });
  }

  it('renvoie les contrats d’un employé, avec leur volume et leur période', async () => {
    const fixedTerm = await createContract('2025-01-01', '2025-12-31');
    const permanent = await createContract('2026-01-01');

    const response = await getAs(app, testActors.managerOfA, `/employees/${camille.id}/contracts`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [
        {
          id: fixedTerm.id,
          employeeId: camille.id,
          weeklyMinutesMin: 1680,
          weeklyMinutesMax: 2100,
          startsOn: '2025-01-01',
          endsOn: '2025-12-31',
          createdAt: '2026-11-15T08:00:00Z',
        },
        {
          id: permanent.id,
          employeeId: camille.id,
          weeklyMinutesMin: 1680,
          weeklyMinutesMax: 2100,
          startsOn: '2026-01-01',
          endsOn: null,
          createdAt: '2026-11-15T08:00:00Z',
        },
      ],
      nextCursor: null,
    });
  });

  it('pagine les contrats par curseur', async () => {
    const first = await createContract('2025-01-01', '2025-12-31');
    const second = await createContract('2026-01-01');
    const path = `/employees/${camille.id}/contracts?limit=1`;

    const firstPage = await getAs(app, testActors.adminOfA, path);
    const lastPage = await getAs(app, testActors.adminOfA, `${path}&cursor=${first.id}`);

    expect(firstPage.body.items.map((item: { id: string }) => item.id)).toEqual([first.id]);
    expect(firstPage.body.nextCursor).toBe(first.id);
    expect(lastPage.body.items.map((item: { id: string }) => item.id)).toEqual([second.id]);
    expect(lastPage.body.nextCursor).toBeNull();
  });

  it('renvoie une liste vide pour un employé sans contrat', async () => {
    const response = await getAs(app, testActors.managerOfA, `/employees/${camille.id}/contracts`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  it('BDD isolation : les contrats d’un employé d’une autre organisation sont indiscernables de ceux d’un employé absent', async () => {
    await createContract('2026-01-01');

    const foreign = await getAs(app, testActors.managerOfB, `/employees/${camille.id}/contracts`);
    const missing = await getAs(app, testActors.managerOfB, `/employees/${UNKNOWN_ID}/contracts`);

    expect(foreign.status).toBe(404);
    expect(withoutInstance(foreign.body)).toEqual(withoutInstance(missing.body));
  });

  it('traite un identifiant d’employé mal formé comme une ressource absente', async () => {
    const response = await getAs(app, testActors.managerOfA, '/employees/camille/contracts');

    expect(response.status).toBe(404);
  });

  it('refuse un employé, qui ne consulte pas les contrats du personnel, et un anonyme', async () => {
    const path = `/employees/${camille.id}/contracts`;

    expect((await getAs(app, testActors.employeeOfA, path)).status).toBe(403);
    expect((await getAs(app, undefined, path)).status).toBe(401);
  });
});
