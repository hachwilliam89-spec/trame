import type { INestApplication } from '@nestjs/common';
import { ReceiveScheduleReport } from '@trame/api/scheduling/application';
import type { InMemoryScheduleGenerations } from '@trame/api/scheduling/application/testing';
import type { Actor } from '@trame/platform/auth';
import { TEST_ACTOR_HEADER, testActorHeader } from '@trame/platform/auth/testing';
import type { FixedClock } from '@trame/platform/clock';
import {
  type ScheduleReportV1,
  scheduleGenerationV1,
  weekScheduleGenerationsV1,
} from '@trame/shared/contracts';
import request from 'supertest';
import {
  EMPTY_SITE_A,
  OUT_OF_BOUNDS_SITE_A,
  SITE_A,
  TOO_LARGE_SITE_A,
  admin,
  createScheduleGenerationTestApp,
  employee,
  manager,
  otherManager,
} from '../../testing/scheduling-test-app';

const collection = '/api/v1/schedule-generations';
const MONDAY = '2026-11-23';

describe('API des générations de planning', () => {
  let app: INestApplication;
  let clock: FixedClock;
  let generations: InMemoryScheduleGenerations;

  beforeEach(async () => {
    ({ app, clock, generations } = await createScheduleGenerationTestApp());
  });
  afterEach(async () => {
    await app.close();
  });

  function post(
    actor: Actor,
    key: string,
    body: object = { siteId: SITE_A, weekStartsOn: MONDAY },
  ) {
    return request(app.getHttpServer())
      .post(collection)
      .set(TEST_ACTOR_HEADER, testActorHeader(actor))
      .set('Idempotency-Key', key)
      .send(body);
  }
  function get(actor: Actor, path: string) {
    return request(app.getHttpServer())
      .get(`${collection}${path}`)
      .set(TEST_ACTOR_HEADER, testActorHeader(actor));
  }
  function week(actor: Actor, siteId = SITE_A, weekStartsOn = MONDAY) {
    return get(actor, `?siteId=${siteId}&weekStartsOn=${weekStartsOn}`);
  }
  function expectProblem(response: request.Response, status: number) {
    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body.status).toBe(status);
  }
  async function report(generationId: string, kind: ScheduleReportV1, id: string) {
    const [requestMessage] = generations
      .messages()
      .filter((message) => message.payload.generationId === generationId);
    await new ReceiveScheduleReport(generations, clock).execute({
      id,
      organizationId: manager.organizationId,
      type: 'scheduling.schedule-reported.v1',
      occurredAt: '2026-11-17T10:00:01Z',
      payload: { generationId, requestId: requestMessage?.id ?? '', report: kind },
    });
  }

  it.each([admin, manager])(
    'lance une génération : 202, lien et instantané consultables',
    async (actor) => {
      const response = await post(actor, 'request-1');

      expect(response.status).toBe(202);
      const generation = scheduleGenerationV1.parse(response.body);
      expect(generation).toMatchObject({ siteId: SITE_A, weekStartsOn: MONDAY, status: 'QUEUED' });
      expect(generation.problem.shifts[0]).toMatchObject({
        requiredCount: 2,
        effectiveMinutes: 420,
      });
      expect(generation.parameters).toEqual({ timeLimitSeconds: 30, workers: 1, seed: 0 });
      expect(response.headers['location']).toBe(`${collection}/${generation.id}`);
      expect(response.headers['x-correlation-id']).toBe(generation.id);
      const reread = await get(actor, `/${generation.id}`);
      expect(reread.status).toBe(200);
      expect(reread.body).toEqual(response.body);
    },
  );

  it('refuse un salarié simple', async () => {
    expectProblem(await post(employee, 'request-1'), 403);
  });

  it('Double clic : la même clé rend la même génération, un seul message', async () => {
    const first = await post(manager, 'same-key');
    const replay = await post(manager, 'same-key');

    expect(replay.status).toBe(202);
    expect(replay.body).toEqual(first.body);
    expect(generations.messages()).toHaveLength(1);
  });

  it('409 pour la même clé sur une autre semaine', async () => {
    await post(manager, 'same-key');

    expectProblem(
      await post(manager, 'same-key', { siteId: SITE_A, weekStartsOn: '2026-11-30' }),
      409,
    );
  });

  it.each([
    ['une semaine qui ne commence pas un lundi', { siteId: SITE_A, weekStartsOn: '2026-11-24' }],
    ['un champ inattendu', { siteId: SITE_A, weekStartsOn: MONDAY, organizationId: SITE_A }],
    ['un site invalide', { siteId: 'site', weekStartsOn: MONDAY }],
  ])('400 pour %s', async (_case, body) => {
    expectProblem(await post(manager, 'request-1', body), 400);
  });

  it('400 sans clé d’idempotence', async () => {
    const response = await request(app.getHttpServer())
      .post(collection)
      .set(TEST_ACTOR_HEADER, testActorHeader(manager))
      .send({ siteId: SITE_A, weekStartsOn: MONDAY });

    expectProblem(response, 400);
  });

  it('422 pour une semaine sans besoin, ou trop grande pour un calcul', async () => {
    const empty = await post(manager, 'empty', { siteId: EMPTY_SITE_A, weekStartsOn: MONDAY });
    const tooLarge = await post(manager, 'large', {
      siteId: TOO_LARGE_SITE_A,
      weekStartsOn: MONDAY,
    });

    expectProblem(empty, 422);
    expect(empty.body.detail).toBe('Aucun besoin de couverture pour cette semaine.');
    expectProblem(tooLarge, 422);
    expect(generations.messages()).toHaveLength(0);
  });

  it('422 pour une semaine hors des limites du moteur, sans génération ni message', async () => {
    const response = await post(manager, 'out-of-bounds', {
      siteId: OUT_OF_BOUNDS_SITE_A,
      weekStartsOn: MONDAY,
    });

    expectProblem(response, 422);
    expect(generations.messages()).toHaveLength(0);
    const weekOfSite = await week(manager, OUT_OF_BOUNDS_SITE_A);
    expect(weekOfSite.body).toEqual({ latestAttempt: null, latestSchedule: null });
  });

  it('Isolation : une autre organisation ne lance ni ne lit rien de A (404)', async () => {
    const launched = await post(manager, 'request-1');

    expectProblem(await post(otherManager, 'request-1'), 404);
    expectProblem(await get(otherManager, `/${launched.body.id}`), 404);
    expectProblem(await week(otherManager), 404);
    expectProblem(await get(manager, '/pas-un-uuid'), 404);
  });

  it('montre le dernier essai UNKNOWN sans effacer le dernier planning exploitable', async () => {
    const solved = await post(manager, 'first');
    generations.finish(solved.body.id, {
      status: 'FEASIBLE',
      schedule: { assignments: [], shortfalls: [] },
    });
    clock.advance({ minutes: 5 });
    const retried = await post(manager, 'second');
    generations.finish(retried.body.id, { status: 'UNKNOWN', schedule: null });

    const response = await week(manager);

    expect(response.status).toBe(200);
    const generationsOfWeek = weekScheduleGenerationsV1.parse(response.body);
    expect(generationsOfWeek.latestAttempt?.id).toBe(retried.body.id);
    expect(generationsOfWeek.latestAttempt?.outcome?.result.status).toBe('UNKNOWN');
    expect(generationsOfWeek.latestSchedule?.id).toBe(solved.body.id);
  });

  it('rend une semaine sans génération, et 400 hors lundi', async () => {
    const empty = await week(manager);

    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ latestAttempt: null, latestSchedule: null });
    expectProblem(await week(manager, SITE_A, '2026-11-25'), 400);
  });

  describe('Progression (SSE)', () => {
    function events(actor: Actor, generationId: string, lastEventId?: string) {
      const call = get(
        { ...actor, expiresAtEpochMilliseconds: clock.now().epochMilliseconds + 60_000 },
        `/${generationId}/events`,
      );
      return lastEventId === undefined ? call : call.set('Last-Event-ID', lastEventId);
    }
    const startedId = '0190f0a0-0000-7000-8000-0000000000f1';
    const resultId = '0190f0a0-0000-7000-8000-0000000000f2';

    async function finishedGeneration(): Promise<string> {
      const launched = await post(manager, 'request-1');
      await report(launched.body.id, { kind: 'STARTED' }, startedId);
      await report(
        launched.body.id,
        {
          kind: 'RESULT',
          outcome: {
            result: { status: 'INFEASIBLE', schedule: null },
            checkedRules: ['UN_SEUL_SHIFT'],
            solveSeconds: 0.2,
          },
        },
        resultId,
      );
      return launched.body.id;
    }

    it('émet les événements « schedule-generation » puis se ferme au résultat', async () => {
      const generationId = await finishedGeneration();

      const response = await events(manager, generationId);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/^text\/event-stream/);
      expect(response.text).toContain(`id: ${startedId}\nevent: schedule-generation\ndata: `);
      expect(response.text).toContain('"status":"SUCCEEDED","resultStatus":"INFEASIBLE"');
      expect(response.text).not.toContain('"schedule"');
    });

    it('reprend après Last-Event-ID, puis 204 quand tout est lu', async () => {
      const generationId = await finishedGeneration();

      const resumed = await events(manager, generationId, startedId);
      const done = await events(manager, generationId, resultId);

      expect(resumed.text).not.toContain(startedId);
      expect(resumed.text).toContain(`id: ${resultId}`);
      expect(done.status).toBe(204);
    });

    it('400 pour un curseur inconnu, 404 pour une autre organisation, 401 sans expiration', async () => {
      const generationId = await finishedGeneration();

      expectProblem(
        await events(manager, generationId, '0190f0a0-0000-7000-8000-0000000000ee'),
        400,
      );
      expectProblem(await events(otherManager, generationId), 404);
      expectProblem(await get(manager, `/${generationId}/events`), 401);
    });
  });
});
