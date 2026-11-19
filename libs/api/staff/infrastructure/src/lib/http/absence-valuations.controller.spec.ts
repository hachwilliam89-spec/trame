import type { INestApplication } from '@nestjs/common';
import type { InMemoryPlanningReferenceSource } from '@trame/api/staff/application/testing';
import type { Employee, WorkedShift } from '@trame/api/staff/domain';
import {
  ORGANIZATION_A,
  type StaffTestApp,
  createStaffTestApp,
  sendAs,
  testActors,
} from '../../testing/staff-test-app';

const WAREHOUSE_OF_A = '0190f0a0-0000-7000-8000-0000000000d1';
const MONDAY = Temporal.PlainDate.from('2026-11-23');
const VALUATIONS_OF_THE_WEEK = `/absence-valuations?siteId=${WAREHOUSE_OF_A}&weekStartsOn=2026-11-23`;
const GENERATION = '0190f0a0-0000-7000-8000-000000000a01';
const HOURS = 60;

function parisInstant(localDateTime: string): Temporal.Instant {
  return Temporal.Instant.from(`${localDateTime}+01:00`);
}

function morningShift(date: string): WorkedShift {
  return {
    startsAt: parisInstant(`${date}T06:00`),
    endsAt: parisInstant(`${date}T13:20`),
    breaks: [{ start: parisInstant(`${date}T10:00`), end: parisInstant(`${date}T10:20`) }],
  };
}

describe('API de la valorisation des absences (US-033)', () => {
  let testApp: StaffTestApp;
  let app: INestApplication;
  let source: InMemoryPlanningReferenceSource;
  let camille: Employee;

  beforeEach(async () => {
    testApp = await createStaffTestApp();
    app = testApp.app;
    source = testApp.planningReference;
    testApp.catalog.addSite(ORGANIZATION_A, WAREHOUSE_OF_A, 'Europe/Paris');
    camille = await testApp.createEmployee.execute({
      organizationId: ORGANIZATION_A,
      siteId: WAREHOUSE_OF_A,
      firstName: 'Camille',
      lastName: 'Laurent',
      qualifications: [],
    });
    await testApp.createContract.execute({
      organizationId: ORGANIZATION_A,
      employeeId: camille.id,
      weeklyMinutesMin: 28 * HOURS,
      weeklyMinutesMax: 35 * HOURS,
      startsOn: Temporal.PlainDate.from('2026-01-05'),
      endsOn: undefined,
    });
  });
  afterEach(async () => {
    await app.close();
  });

  async function declare(startsAt: string, endsAt: string) {
    const response = await sendAs(
      app,
      testActors.managerOfA,
      'post',
      `/employees/${camille.id}/absences`,
      { startsAt: `${startsAt}:00+01:00`, endsAt: `${endsAt}:00+01:00`, reason: 'LEAVE' },
    );
    expect(response.status).toBe(201);
  }

  function giveDuration(date: string, valuedMinutes: number, actor = testActors.managerOfA) {
    return sendAs(app, actor, 'put', `/employees/${camille.id}/absence-days/${date}`, {
      valuedMinutes,
    });
  }

  function sixActivityDays(): Temporal.PlainDate[] {
    return [0, 1, 2, 3, 4, 5].map((offset) => MONDAY.add({ days: offset }));
  }

  it('BDD : valorise sur le planning de référence figé à la déclaration', async () => {
    source.setLatestPlanning(WAREHOUSE_OF_A, MONDAY, camille.id, {
      generationId: GENERATION,
      workedShifts: ['2026-11-23', '2026-11-24'].map(morningShift),
    });
    await declare('2026-11-24T00:00', '2026-11-25T00:00');

    const response = await sendAs(app, testActors.managerOfA, 'get', VALUATIONS_OF_THE_WEEK);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      siteId: WAREHOUSE_OF_A,
      weekStartsOn: '2026-11-23',
      valuations: [
        {
          employeeId: camille.id,
          reference: {
            method: 'REFERENCE_PLANNING',
            frozenAt: '2026-11-15T08:00:00Z',
            generationId: GENERATION,
          },
          status: 'VALUED',
          absenceMinutes: 7 * HOURS,
          daysToDefine: [],
        },
      ],
    });
  });

  it('BDD : sans référence, une absence partielle attend sa durée, puis la valorise', async () => {
    source.setActivityDays(WAREHOUSE_OF_A, MONDAY, sixActivityDays());
    await declare('2026-11-26T06:00', '2026-11-26T10:00');

    const before = await sendAs(app, testActors.managerOfA, 'get', VALUATIONS_OF_THE_WEEK);
    const given = await giveDuration('2026-11-26', 3 * HOURS);
    const after = await sendAs(app, testActors.managerOfA, 'get', VALUATIONS_OF_THE_WEEK);

    expect(before.body.valuations[0]).toMatchObject({
      reference: {
        method: 'EQUAL_SHARE_OF_ACTIVITY_DAYS',
        weeklyMinimumMinutes: 28 * HOURS,
        dailyShareMinutes: 4 * HOURS + 40,
        dayValuations: {},
      },
      status: 'TO_DEFINE',
      absenceMinutes: null,
      daysToDefine: ['2026-11-26'],
    });
    expect(given.status).toBe(204);
    expect(after.body.valuations[0]).toMatchObject({
      reference: { dayValuations: { '2026-11-26': 3 * HOURS } },
      status: 'VALUED',
      absenceMinutes: 3 * HOURS,
      daysToDefine: [],
    });
  });

  it('BDD : refuse une durée au-delà de la part journalière, avec un pointeur vers la durée', async () => {
    source.setActivityDays(WAREHOUSE_OF_A, MONDAY, sixActivityDays());
    await declare('2026-11-26T06:00', '2026-11-26T10:00');

    const response = await giveDuration('2026-11-26', 5 * HOURS);

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([
      {
        pointer: '#/valuedMinutes',
        code: 'invalid_day_valuation',
        detail: 'Durée refusée : au plus la part journalière, 4 h 40.',
      },
    ]);
  });

  it('refuse une durée pour un jour sans activité, et une date mal formée', async () => {
    source.setActivityDays(WAREHOUSE_OF_A, MONDAY, sixActivityDays());
    await declare('2026-11-26T06:00', '2026-11-26T10:00');

    const sunday = await giveDuration('2026-11-29', HOURS);
    const malformed = await giveDuration('29-11-2026', HOURS);

    expect(sunday.status).toBe(400);
    expect(sunday.body.errors).toEqual([
      expect.objectContaining({ pointer: '#/date', code: 'not_an_activity_day' }),
    ]);
    expect(malformed.status).toBe(400);
    expect(malformed.body.errors).toEqual([expect.objectContaining({ pointer: '#/date' })]);
  });

  it('refuse en 409 une durée pour une semaine valorisée sur un planning de référence', async () => {
    source.setLatestPlanning(WAREHOUSE_OF_A, MONDAY, camille.id, {
      generationId: GENERATION,
      workedShifts: [morningShift('2026-11-26')],
    });
    await declare('2026-11-26T06:00', '2026-11-26T10:00');

    const response = await giveDuration('2026-11-26', HOURS);

    expect(response.status).toBe(409);
  });

  describe('BDD isolation', () => {
    it('ne laisse ni lire les valorisations du site ni donner une durée depuis une autre organisation', async () => {
      source.setActivityDays(WAREHOUSE_OF_A, MONDAY, sixActivityDays());
      await declare('2026-11-26T06:00', '2026-11-26T10:00');

      const read = await sendAs(app, testActors.managerOfB, 'get', VALUATIONS_OF_THE_WEEK);
      const given = await giveDuration('2026-11-26', HOURS, testActors.managerOfB);
      const unchanged = await sendAs(app, testActors.managerOfA, 'get', VALUATIONS_OF_THE_WEEK);

      expect(read.status).toBe(404);
      expect(given.status).toBe(404);
      expect(unchanged.body.valuations[0]).toMatchObject({ status: 'TO_DEFINE' });
    });
  });

  it('refuse un employé, qui ne gère pas les absences, et un anonyme', async () => {
    const requests = [
      ['get', VALUATIONS_OF_THE_WEEK, undefined],
      ['put', `/employees/${camille.id}/absence-days/2026-11-26`, { valuedMinutes: HOURS }],
    ] as const;

    for (const [method, path, body] of requests) {
      expect((await sendAs(app, testActors.employeeOfA, method, path, body)).status).toBe(403);
      expect((await sendAs(app, undefined, method, path, body)).status).toBe(401);
    }
  });
});
