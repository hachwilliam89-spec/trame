import type { INestApplication } from '@nestjs/common';
import type { InMemoryDiagnosticRuns } from '@trame/api/scheduling/application/testing';
import type { Actor } from '@trame/platform/auth';
import { TEST_ACTOR_HEADER, testActorHeader } from '@trame/platform/auth/testing';
import { diagnosticRunV1 } from '@trame/shared/contracts';
import request from 'supertest';
import {
  admin,
  manager,
  employee,
  otherManager,
  createSchedulingTestApp,
} from '../../testing/scheduling-test-app';

const collection = '/api/v1/diagnostics/solver-runs';
const unknownId = '0190f0a0-0000-7000-8000-0000000000ff';

describe('API des diagnostics', () => {
  let app: INestApplication;
  let runs: InMemoryDiagnosticRuns;
  beforeEach(async () => {
    ({ app, runs } = await createSchedulingTestApp());
  });
  afterEach(async () => {
    await app.close();
  });

  function post(actor: Actor, key = 'request-1', body: object = {}) {
    return request(app.getHttpServer())
      .post(collection)
      .set(TEST_ACTOR_HEADER, testActorHeader(actor))
      .set('Idempotency-Key', key)
      .send(body);
  }
  function get(actor: Actor, id: string) {
    return request(app.getHttpServer())
      .get(`${collection}/${id}`)
      .set(TEST_ACTOR_HEADER, testActorHeader(actor));
  }
  function expectProblem(response: request.Response, status: number) {
    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body.status).toBe(status);
  }

  it.each([admin, manager])(
    'accepte admin et manager, renvoie 202 et un lien consultable',
    async (actor) => {
      const response = await post(actor);
      expect(response.status).toBe(202);
      const run = diagnosticRunV1.parse(response.body);
      expect(response.body).toEqual({
        id: run.id,
        status: 'QUEUED',
        createdAt: '2026-11-04T10:00:00Z',
      });
      expect(response.headers['location']).toBe(`${collection}/${run.id}`);
      expect(response.headers['x-correlation-id']).toBe(run.id);
      const reread = await get(actor, run.id);
      expect(reread.status).toBe(200);
      expect(reread.body).toEqual(response.body);
    },
  );

  it('rejoue une clé sans créer un second job', async () => {
    const first = await post(manager);
    const replay = await post(manager);
    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    expect(replay.body).toEqual(first.body);
    expect(runs.requests.size).toBe(1);
  });

  it('POST : la même clé dans B ne dévoile jamais le job de A', async () => {
    const first = await post(manager);
    const second = await post(otherManager);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body.id).not.toBe(first.body.id);
    expectProblem(await get(otherManager, first.body.id), 404);
  });

  it('GET : ressource étrangère, absente et identifiant mal formé répondent 404', async () => {
    const created = await post(manager);
    expect(created.status).toBe(202);
    const foreign = await get(otherManager, created.body.id);
    const missing = await get(otherManager, unknownId);
    expectProblem(foreign, 404);
    expectProblem(missing, 404);
    expect({ ...foreign.body, instance: missing.body.instance }).toEqual(missing.body);
    expectProblem(await get(manager, 'mal-forme'), 404);
  });

  it('refuse anonyme et employé sur les deux routes, sans créer de job', async () => {
    expectProblem(
      await request(app.getHttpServer())
        .post(collection)
        .set('Idempotency-Key', 'anonymous')
        .send({}),
      401,
    );
    expectProblem(await request(app.getHttpServer()).get(`${collection}/${unknownId}`), 401);
    expectProblem(await post(employee), 403);
    expectProblem(await get(employee, unknownId), 403);
    expect(runs.requests.size).toBe(0);
  });

  it('refuse une clé absente, vide, trop longue ou avec espace', async () => {
    const withoutKey = await request(app.getHttpServer())
      .post(collection)
      .set(TEST_ACTOR_HEADER, testActorHeader(manager))
      .send({});
    expectProblem(withoutKey, 400);
    for (const key of ['', 'x'.repeat(129), 'avec espace']) {
      expectProblem(await post(manager, key), 400);
    }
    expect(runs.requests.size).toBe(0);
  });

  it.each(
    [{ organizationId: otherManager.organizationId }, { costs: [[1]] }, null, []].map((body) => [
      body,
    ]),
  )('refuse un corps non vide ou non objet (%j)', async (body) => {
    const response = await request(app.getHttpServer())
      .post(collection)
      .set(TEST_ACTOR_HEADER, testActorHeader(manager))
      .set('Idempotency-Key', 'body-validation')
      .send(JSON.stringify(body))
      .set('Content-Type', 'application/json');
    expectProblem(response, 400);
    expect(runs.requests.size).toBe(0);
  });
});
