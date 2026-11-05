import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DatabaseModule, PrismaService } from '@trame/api/database';
import { startTestDatabase, type TestDatabase } from '@trame/api/database/testing';
import { ReadDiagnosticProgress, PruneDiagnosticProgress } from '@trame/api/scheduling/application';
import { AuthModule } from '@trame/platform/auth';
import {
  testActorResolver,
  TEST_ACTOR_HEADER,
  testActorHeader,
} from '@trame/platform/auth/testing';
import { ClockModule, CLOCK, FixedClock } from '@trame/platform/clock';
import { IdsModule } from '@trame/platform/ids';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import request from 'supertest';
import { SchedulingModule } from '../scheduling.module';
import { manager, otherManager, employee } from '../../testing/scheduling-test-app';

const runId = '0190f0a0-0000-7000-8000-000000000001';
const eventIds = ['0190f0a0-0000-7000-8000-000000000002', '0190f0a0-0000-7000-8000-000000000003'];
const collection = '/api/v1/diagnostics/solver-runs';
const path = `${collection}/${runId}/events`;

describe('Progression persistée, HTTP et purge', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FixedClock('2026-11-05T10:00:00Z');
  const authenticated = (actor = manager) => ({
    ...actor,
    expiresAtEpochMilliseconds: clock.now().epochMilliseconds + 60_000,
  });
  function get(actor = manager, cursor?: string) {
    const call = request(app.getHttpServer())
      .get(path)
      .set(TEST_ACTOR_HEADER, testActorHeader(authenticated(actor)));
    return cursor === undefined ? call : call.set('Last-Event-ID', cursor);
  }
  beforeAll(async () => {
    database = await startTestDatabase();
    const module = await Test.createTestingModule({
      imports: [
        ProblemDetailsModule,
        AuthModule.forRoot({ resolveActor: testActorResolver }),
        ClockModule,
        IdsModule,
        DatabaseModule.forRootAsync({ useFactory: () => ({ url: database.url }) }),
        SchedulingModule,
      ],
    })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
  });
  beforeEach(async () => {
    clock.set('2026-11-05T10:00:00Z');
    await prisma.diagnosticEvent.deleteMany();
    await prisma.diagnosticRun.deleteMany();
    await prisma.diagnosticRun.create({
      data: {
        id: runId,
        organizationId: manager.organizationId,
        idempotencyKey: 'retained-key',
        status: 'FAILED',
        failure: 'PROCESSING_FAILED',
        createdAt: new Date('2026-11-05T09:00:00Z'),
        finishedAt: new Date('2026-11-05T09:00:01Z'),
        lastSequence: 2,
      },
    });
    for (const [index, id] of eventIds.entries()) {
      const report =
        index === 0 ? { kind: 'STARTED' } : { kind: 'FAILED', code: 'PROCESSING_FAILED' };
      await prisma.diagnosticEvent.create({
        data: {
          id,
          organizationId: manager.organizationId,
          runId,
          sequence: index + 1,
          occurredAt: new Date('2026-11-05T09:00:01Z'),
          body: {
            id,
            organizationId: manager.organizationId,
            type: 'scheduling.diagnostic-reported.v1',
            occurredAt: '2026-11-05T09:00:01Z',
            payload: { runId, requestId: runId, report },
          },
        },
      });
    }
  });
  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  it('rejoue dans l’ordre et reprend uniquement après le dernier identifiant reçu', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-correlation-id']).toBe(runId);
    expect(response.text.indexOf(`id: ${eventIds[0]}`)).toBeLessThan(
      response.text.indexOf(`id: ${eventIds[1]}`),
    );
    const resumed = await get(manager, eventIds[0]);
    expect(resumed.text).not.toContain(`id: ${eventIds[0]}`);
    expect(resumed.text).toContain(`id: ${eventIds[1]}`);
    expect((await get(manager, eventIds[1])).status).toBe(204);
  });
  it('isole les organisations et refuse anonyme, employé et curseurs invalides avant tout flux', async () => {
    const responses = [
      [await request(app.getHttpServer()).get(path), 401],
      [await get(employee), 403],
      [await get(otherManager), 404],
      [await get(manager, 'not-a-uuid'), 400],
      [await get(manager, runId), 400],
    ] as const;
    for (const [response, status] of responses) {
      expect(response.status).toBe(status);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.text).not.toContain('event: diagnostic');
    }
  });
  it('refuse les jetons sans échéance et les jetons passés dans la query string', async () => {
    expect(
      (
        await request(app.getHttpServer())
          .get(path)
          .set(TEST_ACTOR_HEADER, testActorHeader(manager))
      ).status,
    ).toBe(401);
    expect((await request(app.getHttpServer()).get(path + '?access_token=secret')).status).toBe(
      401,
    );
  });
  it('refuse exactement à une heure, purge les événements et conserve résultat et idempotence', async () => {
    expect((await get()).status).toBe(200);
    clock.advance({ seconds: 1 });
    expect((await get()).status).toBe(410);
    expect(await app.get(PruneDiagnosticProgress).execute()).toBe(2);
    expect(await prisma.diagnosticEvent.count()).toBe(0);
    expect((await get(manager, eventIds[0])).status).toBe(410);
    const result = await request(app.getHttpServer())
      .get(`${collection}/${runId}`)
      .set(TEST_ACTOR_HEADER, testActorHeader(manager));
    expect(result.body).toMatchObject({
      id: runId,
      status: 'FAILED',
      failure: 'PROCESSING_FAILED',
    });
    const replay = await request(app.getHttpServer())
      .post(collection)
      .set(TEST_ACTOR_HEADER, testActorHeader(manager))
      .set('Idempotency-Key', 'retained-key')
      .send({});
    expect(replay.status).toBe(202);
    expect(replay.body.id).toBe(runId);
  });
  it('conserve les événements des jobs non terminés et transmet le curseur au stockage', async () => {
    await prisma.diagnosticRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', finishedAt: null },
    });
    clock.advance({ hours: 2 });
    expect(await app.get(PruneDiagnosticProgress).execute()).toBe(0);
    const progress = await app
      .get(ReadDiagnosticProgress)
      .execute({ organizationId: manager.organizationId, runId, after: eventIds[0] });
    expect(progress.events.map((event) => event.sequence)).toEqual([2]);
  });
});
