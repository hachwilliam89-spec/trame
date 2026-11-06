import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import type { GetMessage } from 'amqplib';
import { Test } from '@nestjs/testing';
import { DatabaseModule, PrismaService } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { AuthModule } from '@trame/platform/auth';
import {
  testActorResolver,
  TEST_ACTOR_HEADER,
  testActorHeader,
} from '@trame/platform/auth/testing';
import { ClockModule, SystemClock } from '@trame/platform/clock';
import { IdsModule, UuidV7Generator } from '@trame/platform/ids';
import { AmqpSession } from '@trame/platform/messaging';
import { type TestBroker, startTestBroker } from '@trame/platform/messaging/testing';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import { diagnosticTopologyV1, diagnosticRunV1 } from '@trame/shared/contracts';
import request from 'supertest';
import { manager, otherManager } from '../../testing/scheduling-test-app';
import { SchedulingModule } from '../scheduling.module';
import { DiagnosticTransport } from './diagnostic-transport';

const root = resolve(import.meta.dirname, '../../../../../../..');
const topology = diagnosticTopologyV1.parse(
  JSON.parse(readFileSync(resolve(root, 'infra/rabbitmq/diagnostic-topology.json'), 'utf8')),
);
const collection = '/api/v1/diagnostics/solver-runs';

describe('Aller-retour RabbitMQ ↔ vrai moteur Python', () => {
  let database: TestDatabase;
  let broker: TestBroker;
  let prisma: PrismaService;
  let session: AmqpSession;
  let transport: DiagnosticTransport;
  let worker: ChildProcess;
  let app: INestApplication;
  let output = '';
  const clock = new SystemClock();
  function newTransport() {
    return new DiagnosticTransport({
      prisma,
      session,
      topology,
      clock,
      ids: new UuidV7Generator(clock),
      logError: () => undefined,
    });
  }
  async function connect() {
    session = await AmqpSession.open(broker.url);
    session.receiver.on('error', (error: Error) => {
      output += ' CHANNEL: ' + error.message;
    });
    await session.declare(topology.exchange, [
      topology.parking,
      topology.deadLetters,
      topology.requests,
      topology.reports,
    ]);
    transport = newTransport();
    await transport.startConsumers();
  }
  async function createRun(key: string) {
    const response = await request(app.getHttpServer())
      .post(collection)
      .set(TEST_ACTOR_HEADER, testActorHeader(manager))
      .set('Idempotency-Key', key)
      .send({});
    expect(response.status).toBe(202);
    return diagnosticRunV1.parse(response.body);
  }
  async function completed(runId: string) {
    await expect
      .poll(
        async () => {
          await transport.tick();
          if (worker.exitCode !== null) {
            throw new Error(`Worker arrêté : ${output}`);
          }
          return (await prisma.diagnosticRun.findUniqueOrThrow({ where: { id: runId } })).status;
        },
        { timeout: 20_000, interval: 100 },
      )
      .toBe('SUCCEEDED');
  }
  function launchWorker(): void {
    worker = spawn('uv', ['run', '--frozen', 'python', '-m', 'trame_engine.worker'], {
      cwd: resolve(root, 'apps/engine'),
      env: {
        ...process.env,
        AMQP_URL: broker.url,
        DIAGNOSTIC_TOPOLOGY_FILE: resolve(root, 'infra/rabbitmq/diagnostic-topology.json'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    worker.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    worker.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
  }
  beforeAll(async () => {
    [database, broker] = await Promise.all([
      startTestDatabase({ faultInjection: true }),
      startTestBroker(),
    ]);
    prisma = new PrismaService({ url: database.url, requestTimeoutMs: 1_000 });
    await connect();
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
    launchWorker();
  });
  beforeEach(async () => {
    for (const queue of [
      topology.requests,
      topology.reports,
      topology.deadLetters,
      topology.parking,
    ]) {
      await session.receiver.purgeQueue(queue.name);
    }
    await prisma.diagnosticEvent.deleteMany();
    await prisma.inboxReceipt.deleteMany();
    await prisma.outboxMessage.deleteMany();
    await prisma.diagnosticRun.deleteMany();
  });
  afterAll(async () => {
    await stopChild(worker);
    await session?.close();
    await app?.close();
    await prisma?.$disconnect();
    await database?.stop();
    await broker?.stop();
  });

  it('rend le résultat Python consultable, conserve deux événements et isole B', async () => {
    const run = await createRun('real-solver');
    await completed(run.id).catch((error) => {
      throw new Error(String(error) + '\nWORKER: ' + output);
    });
    const response = await request(app.getHttpServer())
      .get(`${collection}/${run.id}`)
      .set(TEST_ACTOR_HEADER, testActorHeader(manager));
    expect(response.status).toBe(200);
    expect(diagnosticRunV1.parse(response.body)).toMatchObject({
      status: 'SUCCEEDED',
      outcome: {
        result: { status: 'OPTIMAL', solution: { cost: 5, assignment: [1, 0, 2] } },
        parameters: { workers: 1, seed: 0, timeLimitSeconds: 5 },
      },
    });
    const events = await prisma.diagnosticEvent.findMany({
      where: { runId: run.id },
      orderBy: { sequence: 'asc' },
    });
    expect(events.map((event) => event.sequence)).toEqual([1, 2]);
    const foreign = await request(app.getHttpServer())
      .get(`${collection}/${run.id}`)
      .set(TEST_ACTOR_HEADER, testActorHeader(otherManager));
    expect(foreign.status).toBe(404);
    expect(output).not.toContain('local-test-only');
  });

  it('supporte un recalcul sans second résultat ni second événement terminal', async () => {
    const run = await createRun('redelivery');
    await completed(run.id);
    const message = await prisma.outboxMessage.findFirstOrThrow();
    await session.publish(
      { exchange: topology.exchange, routingKey: topology.requests.routingKey },
      Buffer.from(JSON.stringify(message.body)),
    );
    await expect
      .poll(
        async () => {
          await transport.tick();
          return prisma.inboxReceipt.count();
        },
        { timeout: 15_000, interval: 100 },
      )
      .toBe(4);
    expect(await prisma.diagnosticEvent.count()).toBe(2);
  });

  it('laisse une publication non routée rejouable, puis termine la demande', async () => {
    const run = await createRun('unrouted');
    const broken = new DiagnosticTransport({
      prisma,
      session,
      clock,
      ids: new UuidV7Generator(clock),
      logError: () => undefined,
      topology: { ...topology, requests: { ...topology.requests, routingKey: 'unbound-test' } },
    });
    await expect(broken.tick()).rejects.toThrow();
    expect(await prisma.outboxMessage.count({ where: { publishedAt: null } })).toBe(1);
    await completed(run.id);
  });

  it('reprend une demande conservée pendant la rupture puis le redémarrage du broker', async () => {
    await session.close();
    const run = await createRun('broker-restart');
    await expect(transport.tick()).rejects.toThrow();
    expect(await prisma.outboxMessage.count({ where: { publishedAt: null } })).toBe(1);
    await broker.restart();
    await expect
      .poll(
        async () => {
          await connect();
          return true;
        },
        { timeout: 30_000, interval: 500 },
      )
      .toBe(true);
    await completed(run.id);
  }, 60_000);

  it('exécute aussi le processus Node réel, avec reconnexion et arrêt propre', async () => {
    await session.close();
    let logs = '';
    const service = spawn(
      resolve(root, 'node_modules/.bin/tsx'),
      ['--tsconfig', 'tsconfig.base.json', 'apps/relay/src/main.ts'],
      {
        cwd: root,
        env: {
          ...process.env,
          DATABASE_URL: database.url,
          AMQP_URL: broker.url,
          DIAGNOSTIC_TOPOLOGY_FILE: resolve(root, 'infra/rabbitmq/diagnostic-topology.json'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    service.stdout?.on('data', (chunk: Buffer) => {
      logs += chunk.toString();
    });
    service.stderr?.on('data', (chunk: Buffer) => {
      logs += chunk.toString();
    });
    try {
      const run = await createRun('node-process');
      await expect
        .poll(
          async () => {
            if (service.exitCode !== null) {
              throw new Error(`Transport arrêté : ${logs}`);
            }
            return (await prisma.diagnosticRun.findUniqueOrThrow({ where: { id: run.id } })).status;
          },
          { timeout: 20_000, interval: 100 },
        )
        .toBe('SUCCEEDED');
      expect(logs).toContain('diagnostic_transport_ready');
      expect(logs).not.toContain('local-test-only');
    } finally {
      await stopChild(service);
      await connect();
    }
  });

  it('attend une panne PostgreSQL prolongée sans épuiser les reprises ni perdre le résultat', async () => {
    await stopChild(worker);
    const run = await createRun('database-outage');
    await transport.tick();
    await database.setServerAvailable(false);
    let tickFinished = false;
    const pendingTick = transport.tick().then(
      () => {
        tickFinished = true;
      },
      () => {
        tickFinished = true;
      },
    );
    try {
      launchWorker();
      // Dépasse la fenêtre cumulée des reprises normales et de la DLQ de l'ancienne version.
      await delay(15_000);
      expect(tickFinished).toBe(false);
      expect(session.isOpen).toBe(true);
      expect(await session.get(topology.parking.name)).toBe(false);
    } finally {
      await database.setServerAvailable(true);
      await pendingTick;
    }
    await completed(run.id);
    expect(await prisma.diagnosticEvent.count()).toBe(2);
  }, 60_000);

  it('borne et retarde les échecs, puis marque FAILED et conserve le message en parking', async () => {
    const retry = {
      ...topology.requests,
      name: 'trame.diagnostic.retry-test.v1',
      routingKey: 'retry-test',
    };
    await session.declare(topology.exchange, [retry]);
    const run = await createRun('retry-exhausted');
    const isolated = new DiagnosticTransport({
      prisma,
      session,
      clock,
      ids: new UuidV7Generator(clock),
      logError: () => undefined,
      topology: { ...topology, requests: retry },
    });
    await isolated.tick();
    const attempts: number[] = [];
    const deliveryTimes: number[] = [];
    const consumer = await session.subscribe(retry.name, async (message) => {
      deliveryTimes.push(performance.now());
      attempts.push(Number(message.properties.headers?.['x-delivery-count'] ?? 0));
      session.receiver.reject(message, true);
    });
    await expect.poll(() => attempts, { timeout: 15_000, interval: 100 }).toEqual([0, 1, 2, 3]);
    await session.receiver.cancel(consumer);
    for (let attempt = 1; attempt < deliveryTimes.length; attempt += 1) {
      const gap = deliveryTimes[attempt] - deliveryTimes[attempt - 1];
      expect(gap).toBeGreaterThanOrEqual(attempt * 900);
    }
    await expect
      .poll(
        async () => {
          return (await prisma.diagnosticRun.findUniqueOrThrow({ where: { id: run.id } })).status;
        },
        { timeout: 10_000, interval: 100 },
      )
      .toBe('FAILED');
    const failed = await prisma.diagnosticRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(failed.failure).toBe('RETRIES_EXHAUSTED');
    // Le transport valide l'échec en base, puis publie le message en parking : la base peut être
    // à jour avant que le message n'y soit. On l'attend donc lui aussi.
    const parkedMessages: GetMessage[] = [];
    await expect
      .poll(
        async () => {
          const parked = await session.get(topology.parking.name);
          if (parked !== false) {
            parkedMessages.push(parked);
          }
          return parkedMessages.length;
        },
        { timeout: 10_000, interval: 100 },
      )
      .toBe(1);
    for (const parkedMessage of parkedMessages) {
      session.receiver.ack(parkedMessage);
    }
  });

  it('isole un message invalide sans modifier de job', async () => {
    await session.publish(
      { exchange: topology.exchange, routingKey: topology.requests.routingKey },
      Buffer.from('not-json'),
    );
    let parked: Awaited<ReturnType<AmqpSession['get']>> = false;
    await expect
      .poll(
        async () => {
          parked = await session.get(topology.parking.name);
          return parked !== false;
        },
        { timeout: 15_000, interval: 100 },
      )
      .toBe(true);
    if (parked !== false) {
      session.receiver.ack(parked);
    }
    expect(await prisma.diagnosticRun.count()).toBe(0);
    expect(await prisma.diagnosticEvent.count()).toBe(0);
  });
});

async function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((done) => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5_000);
    child.once('close', () => {
      clearTimeout(timeout);
      done();
    });
    child.kill('SIGTERM');
  });
}
