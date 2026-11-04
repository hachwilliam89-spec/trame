import { instantToDate, PrismaService } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { StartDiagnostic, type DiagnosticRunRequest } from '@trame/api/scheduling/application';
import { FixedClock } from '@trame/platform/clock';
import { IdempotencyKey } from '@trame/platform/idempotency';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { diagnosticRequestedV1 } from '@trame/shared/contracts';
import { PrismaDiagnosticRuns } from './prisma-diagnostic-runs';

const organizationId = '0190f0a0-0000-7000-8000-00000000000a';
const anotherOrganizationId = '0190f0a0-0000-7000-8000-00000000000b';
const clock = new FixedClock('2026-11-04T10:00:00.123Z');

describe('Enregistrement atomique des diagnostics (PostgreSQL)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let runs: PrismaDiagnosticRuns;
  let start: StartDiagnostic;
  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
    runs = new PrismaDiagnosticRuns(prisma);
    start = new StartDiagnostic(runs, clock, new SequentialIdGenerator());
  });
  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany();
    await prisma.diagnosticRun.deleteMany();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  it('conserve le job et une demande conforme au contrat, sans broker', async () => {
    const run = await start.execute({ organizationId, key: IdempotencyKey.of('new-request') });
    const stored = await runs.findById(organizationId, run.id);
    expect(stored).toEqual(run);
    const messages = await prisma.outboxMessage.findMany({ where: { organizationId } });
    expect(messages).toHaveLength(1);
    const message = diagnosticRequestedV1.parse(messages[0]?.body);
    expect(message).toMatchObject({
      organizationId,
      payload: { runId: run.id, problem: 'assignment-smoke-v1' },
    });
    expect(message.occurredAt).toBe(clock.now().toString());
  });

  it('arbitre deux demandes simultanées et retrouve le même job après reconnexion', async () => {
    const command = { organizationId, key: IdempotencyKey.of('double-click') };
    const otherConnection = new PrismaService({ url: database.url });
    try {
      const otherStart = new StartDiagnostic(new PrismaDiagnosticRuns(otherConnection), clock, {
        next: () => '0190f0a0-0000-7000-8000-000000000099',
      });
      const [first, second] = await Promise.all([
        start.execute(command),
        otherStart.execute(command),
      ]);
      expect(second).toEqual(first);
      expect(await prisma.diagnosticRun.count()).toBe(1);
      expect(await prisma.outboxMessage.count()).toBe(1);
    } finally {
      await otherConnection.$disconnect();
    }
    const reconnected = new PrismaService({ url: database.url });
    try {
      const replay = await new StartDiagnostic(
        new PrismaDiagnosticRuns(reconnected),
        clock,
        new SequentialIdGenerator(),
      ).execute(command);
      expect(await runs.findById(organizationId, replay.id)).toEqual(replay);
      expect(await prisma.outboxMessage.count()).toBe(1);
    } finally {
      await reconnected.$disconnect();
    }
  });

  it('sépare la même clé entre organisations et filtre chaque lecture', async () => {
    const key = IdempotencyKey.of('shared-key');
    const first = await start.execute({ organizationId, key });
    const second = await start.execute({ organizationId: anotherOrganizationId, key });
    expect(second.id).not.toBe(first.id);
    expect(await runs.findById(anotherOrganizationId, first.id)).toBeUndefined();
    expect(await prisma.outboxMessage.count({ where: { organizationId } })).toBe(1);
    expect(
      await prisma.outboxMessage.count({ where: { organizationId: anotherOrganizationId } }),
    ).toBe(1);
  });

  it.each([
    { idempotencyKey: '', status: 'QUEUED' },
    { idempotencyKey: 'avec espace', status: 'QUEUED' },
    { idempotencyKey: 'accentué', status: 'QUEUED' },
    { idempotencyKey: 'visible\n', status: 'QUEUED' },
    { idempotencyKey: 'valid-key', status: 'UNRECOGNIZED' },
  ])('la base refuse aussi un enregistrement invalide (%j)', async (invalidFields) => {
    await expect(
      prisma.diagnosticRun.create({
        data: {
          id: '0190f0a0-0000-7000-8000-000000000051',
          organizationId,
          createdAt: instantToDate(clock.now()),
          ...invalidFields,
        },
      }),
    ).rejects.toThrow();
    expect(await prisma.diagnosticRun.count()).toBe(0);
  });

  it('annule le job si la conservation du message échoue', async () => {
    await start.execute({ organizationId, key: IdempotencyKey.of('existing') });
    const existingMessage = await prisma.outboxMessage.findFirstOrThrow();
    const runId = '0190f0a0-0000-7000-8000-000000000050';
    const request: DiagnosticRunRequest = {
      key: IdempotencyKey.of('rollback'),
      run: { id: runId, organizationId, status: 'QUEUED', createdAt: clock.now() },
      message: {
        id: existingMessage.id,
        organizationId,
        type: 'scheduling.diagnostic-requested.v1',
        occurredAt: clock.now().toString(),
        payload: { runId, problem: 'assignment-smoke-v1' },
      },
    };
    await expect(runs.register(request)).rejects.toThrow();
    expect(await runs.findById(organizationId, runId)).toBeUndefined();
    expect(await prisma.diagnosticRun.count()).toBe(1);
    expect(await prisma.outboxMessage.count()).toBe(1);
  });
});
