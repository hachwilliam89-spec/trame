import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseModule, PrismaService } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { AuthModule } from '@trame/platform/auth';
import {
  TEST_ACTOR_HEADER,
  testActorHeader,
  testActorResolver,
} from '@trame/platform/auth/testing';
import { ClockModule } from '@trame/platform/clock';
import { IdsModule } from '@trame/platform/ids';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import { diagnosticRunV1 } from '@trame/shared/contracts';
import request from 'supertest';
import { manager, otherManager } from '../testing/scheduling-test-app';
import { SchedulingModule } from './scheduling.module';

const collection = '/api/v1/diagnostics/solver-runs';

describe('Module scheduling assemblé sur PostgreSQL', () => {
  let database: TestDatabase;
  let app: INestApplication;
  beforeAll(async () => {
    database = await startTestDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ProblemDetailsModule,
        AuthModule.forRoot({ resolveActor: testActorResolver }),
        ClockModule,
        IdsModule,
        DatabaseModule.forRootAsync({ useFactory: () => ({ url: database.url }) }),
        SchedulingModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  it('renvoie le même job et la même date à la création, au rejeu et à la consultation', async () => {
    const create = () =>
      request(app.getHttpServer())
        .post(collection)
        .set(TEST_ACTOR_HEADER, testActorHeader(manager))
        .set('Idempotency-Key', 'module-test')
        .send({});
    const first = await create();
    const replay = await create();
    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    const run = diagnosticRunV1.parse(first.body);
    expect(replay.body).toEqual(first.body);
    const reread = await request(app.getHttpServer())
      .get(first.headers['location'])
      .set(TEST_ACTOR_HEADER, testActorHeader(manager));
    expect(reread.status).toBe(200);
    expect(reread.body).toEqual(first.body);
    const foreign = await request(app.getHttpServer())
      .get(`${collection}/${run.id}`)
      .set(TEST_ACTOR_HEADER, testActorHeader(otherManager));
    expect(foreign.status).toBe(404);
    const prisma = app.get(PrismaService);
    expect(await prisma.diagnosticRun.count()).toBe(1);
    expect(await prisma.outboxMessage.count()).toBe(1);
  });
});
