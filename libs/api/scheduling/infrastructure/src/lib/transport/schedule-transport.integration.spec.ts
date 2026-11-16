import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { StartDiagnostic, StartScheduleGeneration } from '@trame/api/scheduling/application';
import { InMemoryWeekPlanningSource } from '@trame/api/scheduling/application/testing';
import type { ScheduleGeneration, WeekPlanning } from '@trame/api/scheduling/domain';
import { SystemClock } from '@trame/platform/clock';
import { IdempotencyKey } from '@trame/platform/idempotency';
import { UuidV7Generator } from '@trame/platform/ids';
import { AmqpSession } from '@trame/platform/messaging';
import { type TestBroker, startTestBroker } from '@trame/platform/messaging/testing';
import {
  type ScheduleOutcomeV1,
  type ScheduleReportV1,
  diagnosticTopologyV1,
  scheduleRequestedV1,
  scheduleTopologyV1,
} from '@trame/shared/contracts';
import { PrismaDiagnosticRuns } from '../persistence/prisma-diagnostic-runs';
import { PrismaScheduleGenerations } from '../persistence/prisma-schedule-generations';
import { DiagnosticTransport } from './diagnostic-transport';
import { ScheduleTransport } from './schedule-transport';

const root = resolve(import.meta.dirname, '../../../../../../..');
const topologyFile = resolve(root, 'infra/rabbitmq/schedule-topology.json');
const topology = scheduleTopologyV1.parse(JSON.parse(readFileSync(topologyFile, 'utf8')));
const diagnosticTopologyFile = resolve(root, 'infra/rabbitmq/diagnostic-topology.json');
const diagnosticTopology = diagnosticTopologyV1.parse(
  JSON.parse(readFileSync(diagnosticTopologyFile, 'utf8')),
);

const organizationId = '0190f0a0-0000-7000-8000-00000000000a';
const SITE_ID = '0190f0a0-0000-7000-8000-0000000000d1';
const MONDAY = Temporal.PlainDate.from('2026-11-23');
const CACES_3 = '0190f0a0-0000-7000-8000-000000000031';
const CAMILLE = '0190f0a0-0000-7000-8000-000000000041';
const SACHA = '0190f0a0-0000-7000-8000-000000000042';
const ALL_RULES: ScheduleOutcomeV1['checkedRules'] = [
  'HABILITATION_REQUISE',
  'UN_SEUL_SHIFT',
  'REPOS_QUOTIDIEN_MIN',
  'DUREE_QUOTIDIENNE_MAX',
  'DUREE_HEBDOMADAIRE_MAX',
  'VOLUME_CONTRACTUEL',
];

/** Lundi matin, trois caristes demandés, deux salariés habilités : un manque d'une personne. */
function weekPlanning(weeklyMinutesMin = 0): WeekPlanning {
  const contract = {
    weeklyMinutesMin,
    weeklyMinutesMax: 2100,
    startsOn: Temporal.PlainDate.from('2026-01-05'),
    endsOn: undefined,
  };
  return {
    siteId: SITE_ID,
    weekStartsOn: MONDAY,
    timeZone: 'Europe/Paris',
    shifts: [
      {
        date: MONDAY,
        shiftTemplateId: '0190f0a0-0000-7000-8000-000000000011',
        positionId: '0190f0a0-0000-7000-8000-000000000021',
        startsAt: Temporal.Instant.from('2026-11-23T05:00:00Z'),
        endsAt: Temporal.Instant.from('2026-11-23T12:20:00Z'),
        effectiveMinutes: 420,
        requiredSkillIds: [CACES_3],
        requiredCount: 3,
      },
    ],
    employees: [CAMILLE, SACHA].map((id) => ({
      id,
      qualifications: [{ skillId: CACES_3, expiresOn: undefined }],
      contracts: [contract],
    })),
  };
}

describe('Génération : PostgreSQL, RabbitMQ et vrai moteur Python', () => {
  let database: TestDatabase;
  let broker: TestBroker;
  let prisma: PrismaService;
  let session: AmqpSession;
  let transport: ScheduleTransport;
  let generations: PrismaScheduleGenerations;
  let worker: ChildProcess;
  let output = '';
  const clock = new SystemClock();
  const ids = new UuidV7Generator(clock);

  function launchWorker(): void {
    worker = spawn('uv', ['run', '--frozen', 'python', '-m', 'trame_engine.worker'], {
      cwd: resolve(root, 'apps/engine'),
      env: {
        ...process.env,
        AMQP_URL: broker.url,
        DIAGNOSTIC_TOPOLOGY_FILE: diagnosticTopologyFile,
        SCHEDULE_TOPOLOGY_FILE: topologyFile,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [worker.stdout, worker.stderr]) {
      stream?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
    }
  }

  beforeAll(async () => {
    [database, broker] = await Promise.all([startTestDatabase(), startTestBroker()]);
    prisma = new PrismaService({ url: database.url, requestTimeoutMs: 1_000 });
    generations = new PrismaScheduleGenerations(prisma);
    session = await AmqpSession.open(broker.url);
    await session.declare(topology.exchange, [
      topology.parking,
      topology.deadLetters,
      topology.requests,
      topology.reports,
    ]);
    transport = new ScheduleTransport({
      prisma,
      session,
      topology,
      clock,
      ids,
      logError: () => undefined,
    });
    await transport.startConsumers();
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
    await prisma.inboxReceipt.deleteMany();
    await prisma.outboxMessage.deleteMany();
    await prisma.scheduleGeneration.deleteMany();
  });
  afterAll(async () => {
    worker?.kill('SIGTERM');
    await session?.close();
    await prisma?.$disconnect();
    await Promise.all([database?.stop(), broker?.stop()]);
  });

  function launch(key: string, planning = weekPlanning()): Promise<ScheduleGeneration> {
    const source = new InMemoryWeekPlanningSource();
    source.define(organizationId, planning);
    return new StartScheduleGeneration(generations, source, clock, ids).execute({
      organizationId,
      siteId: SITE_ID,
      weekStartsOn: MONDAY,
      key: IdempotencyKey.of(key),
    });
  }

  /** `relay` : publier aussi les demandes en attente, donc faire calculer le vrai moteur. */
  async function settled(generationId: string, relay = true): Promise<ScheduleGeneration> {
    await expect
      .poll(
        async () => {
          if (relay) {
            await transport.tick();
          }
          if (worker.exitCode !== null) {
            throw new Error(`Worker arrêté : ${output}`);
          }
          const stored = await generations.findById(organizationId, generationId);
          return stored?.status;
        },
        { timeout: 30_000, interval: 100 },
      )
      .toMatch(/^(SUCCEEDED|FAILED)$/);
    const stored = await generations.findById(organizationId, generationId);
    if (stored === undefined) {
      throw new Error('Génération disparue.');
    }
    return stored;
  }

  /** La demande publiée pour cette génération, parmi celles de l'outbox. */
  async function requestIdOf(generationId: string): Promise<string> {
    const requests = await prisma.outboxMessage.findMany({
      where: { type: 'scheduling.schedule-requested.v1' },
    });
    const request = requests.find(
      (candidate) =>
        scheduleRequestedV1.parse(candidate.body).payload.generationId === generationId,
    );
    if (request === undefined) {
      throw new Error('Demande introuvable.');
    }
    return request.id;
  }

  /** Retire le message garé, pour que le test suivant parte d'un parking vide. */
  async function takeParked(): Promise<void> {
    await expect
      .poll(async () => {
        const parked = await session.get(topology.parking.name);
        if (parked === false) {
          return false;
        }
        session.receiver.ack(parked);
        return true;
      })
      .toBe(true);
  }

  async function injectReport(generation: ScheduleGeneration, report: unknown): Promise<void> {
    const message = {
      id: ids.next(),
      organizationId,
      type: 'scheduling.schedule-reported.v1',
      occurredAt: clock.now().toString(),
      payload: {
        generationId: generation.id,
        requestId: await requestIdOf(generation.id),
        report,
      },
    };
    await session.publish(
      { exchange: topology.exchange, routingKey: topology.reports.routingKey },
      Buffer.from(JSON.stringify(message)),
    );
  }

  it('Planning proposé : le résultat du moteur revient et reste lisible, sous-effectif chiffré', async () => {
    const generation = await launch('proposed');

    const solved = await settled(generation.id);

    expect(solved.status).toBe('SUCCEEDED');
    expect(solved.outcome?.result.status).toBe('OPTIMAL');
    expect([...(solved.outcome?.checkedRules ?? [])].sort()).toEqual([...ALL_RULES].sort());
    const schedule = solved.outcome?.result.schedule;
    expect(schedule?.assignments).toHaveLength(2);
    expect(schedule?.shortfalls).toEqual([
      { shiftId: generation.problem.shifts[0]?.id, requiredCount: 3, assignedCount: 2 },
    ]);
    expect((await generations.latestWithSchedule(organizationId, SITE_ID, MONDAY))?.id).toBe(
      generation.id,
    );
  });

  it('Aucun planning légal : un minimum contractuel inatteignable donne INFEASIBLE, sans planning', async () => {
    // 35 h exigées, un seul shift de 7 h dans la semaine.
    const generation = await launch('infeasible', weekPlanning(2100));

    const impossible = await settled(generation.id);

    expect(impossible.status).toBe('SUCCEEDED');
    expect(impossible.outcome?.result).toEqual({ status: 'INFEASIBLE', schedule: null });
  });

  it('Délai atteint sans solution : un nouvel essai UNKNOWN ne masque pas le dernier planning', async () => {
    const solved = await settled((await launch('first')).id);
    const retried = await launch('second');
    const unknown: ScheduleReportV1 = {
      kind: 'RESULT',
      outcome: {
        result: { status: 'UNKNOWN', schedule: null },
        checkedRules: ALL_RULES,
        solveSeconds: 30,
      },
    };

    // Le relais ne publie pas la demande : seul le rapport injecté termine cet essai.
    await injectReport(retried, unknown);
    const timedOut = await settled(retried.id, false);

    expect(timedOut.outcome?.result.status).toBe('UNKNOWN');
    expect((await generations.latestAttempt(organizationId, SITE_ID, MONDAY))?.id).toBe(retried.id);
    expect((await generations.latestWithSchedule(organizationId, SITE_ID, MONDAY))?.id).toBe(
      solved.id,
    );
  });

  it('Un planning incohérent part en rebut et fait échouer la génération', async () => {
    const generation = await launch('inconsistent');
    const shiftId = generation.problem.shifts[0]?.id ?? '';
    const twoAnnouncedForOne: ScheduleReportV1 = {
      kind: 'RESULT',
      outcome: {
        result: {
          status: 'FEASIBLE',
          schedule: {
            assignments: [{ shiftId, employeeId: CAMILLE }],
            shortfalls: [{ shiftId, requiredCount: 3, assignedCount: 2 }],
          },
        },
        checkedRules: ALL_RULES,
        solveSeconds: 0.1,
      },
    };

    await injectReport(generation, twoAnnouncedForOne);
    const failed = await settled(generation.id, false);

    expect(failed).toMatchObject({ status: 'FAILED', failure: 'PROCESSING_FAILED' });
    expect(failed.outcome).toBeUndefined();
    await takeParked();
  });

  it('Un rapport illisible mais rattaché à sa demande fait échouer la génération', async () => {
    const generation = await launch('unreadable');

    await injectReport(generation, { kind: 'RESULT' });
    const failed = await settled(generation.id, false);

    expect(failed).toMatchObject({ status: 'FAILED', failure: 'PROCESSING_FAILED' });
    await takeParked();
  });

  it('Une demande en rebut fait échouer sa génération, une seule fois', async () => {
    const generation = await launch('exhausted');
    const request = await prisma.outboxMessage.findFirstOrThrow();

    for (let copy = 0; copy < 2; copy += 1) {
      await session.publish(
        { exchange: topology.exchange, routingKey: topology.deadLetters.routingKey },
        Buffer.from(JSON.stringify(request.body)),
      );
    }
    const failed = await settled(generation.id, false);

    expect(failed).toMatchObject({ status: 'FAILED', failure: 'RETRIES_EXHAUSTED' });
    await expect
      .poll(async () => (await session.receiver.checkQueue(topology.parking.name)).messageCount)
      .toBe(2);
  });

  it('Une file de génération saturée n’interrompt ni la session ni le diagnostic', async () => {
    // File de génération de test limitée à un message, déjà remplie : la publication est refusée.
    const saturated = {
      ...topology,
      exchange: 'trame.schedule.saturated-test',
      requests: {
        name: 'trame.schedule.saturated-test.requests',
        routingKey: 'requests',
        arguments: { 'x-queue-type': 'quorum', 'x-max-length': 1, 'x-overflow': 'reject-publish' },
      },
    };
    await session.declare(saturated.exchange, [saturated.requests]);
    await session.receiver.purgeQueue(saturated.requests.name);
    await session.publish(
      { exchange: saturated.exchange, routingKey: saturated.requests.routingKey },
      Buffer.from('{}'),
    );
    await session.declare(diagnosticTopology.exchange, [
      diagnosticTopology.parking,
      diagnosticTopology.deadLetters,
      diagnosticTopology.requests,
      diagnosticTopology.reports,
    ]);
    const refusals: string[] = [];
    const schedules = new ScheduleTransport({
      prisma,
      session,
      topology: saturated,
      clock,
      ids,
      logError: (errorType) => refusals.push(errorType),
    });
    const diagnostics = new DiagnosticTransport({
      prisma,
      session,
      topology: diagnosticTopology,
      clock,
      ids,
      logError: () => undefined,
    });
    await diagnostics.startConsumers();
    await launch('saturated');
    const run = await new StartDiagnostic(new PrismaDiagnosticRuns(prisma), clock, ids).execute({
      organizationId,
      key: IdempotencyKey.of('next-to-saturated'),
    });

    await expect
      .poll(
        async () => {
          await schedules.tick();
          await diagnostics.tick();
          return (await prisma.diagnosticRun.findUniqueOrThrow({ where: { id: run.id } })).status;
        },
        { timeout: 30_000, interval: 100 },
      )
      .toBe('SUCCEEDED');

    expect(refusals).toContain('PublicationRefused');
    expect(session.isOpen).toBe(true);
    const waiting = await prisma.outboxMessage.count({
      where: { type: 'scheduling.schedule-requested.v1', publishedAt: null },
    });
    expect(waiting).toBe(1);
  });
});
