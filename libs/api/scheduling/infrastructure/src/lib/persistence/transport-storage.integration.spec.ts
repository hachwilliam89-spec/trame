import { readFileSync } from 'node:fs';
import { PrismaService } from '@trame/api/database';
import { startTestDatabase, type TestDatabase } from '@trame/api/database/testing';
import {
  ReceiveDiagnosticReport,
  StartDiagnostic,
  UnmatchedDiagnosticReportError,
} from '@trame/api/scheduling/application';
import { FixedClock } from '@trame/platform/clock';
import { IdempotencyKey } from '@trame/platform/idempotency';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { diagnosticReportedV1 } from '@trame/shared/contracts';
import { PrismaDiagnosticRuns } from './prisma-diagnostic-runs';
import { PrismaDiagnosticReports } from './prisma-diagnostic-reports';
import { PrismaOutboxStore } from './prisma-outbox-store';
const organizationId = '0190f0a0-0000-7000-8000-00000000000a';
const clock = new FixedClock('2026-11-04T10:00:00Z');
const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../../shared/contracts/fixtures/DiagnosticReportedV1/valid/optimal.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

describe('Transport persistant et inbox (PostgreSQL)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let runs: PrismaDiagnosticRuns;
  let start: StartDiagnostic;
  let receive: ReceiveDiagnosticReport;
  let store: PrismaOutboxStore;
  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
    runs = new PrismaDiagnosticRuns(prisma);
    start = new StartDiagnostic(runs, clock, new SequentialIdGenerator());
    receive = new ReceiveDiagnosticReport(new PrismaDiagnosticReports(prisma, clock), clock);
    store = new PrismaOutboxStore(prisma, clock);
  });
  beforeEach(async () => {
    await prisma.diagnosticEvent.deleteMany();
    await prisma.inboxReceipt.deleteMany();
    await prisma.outboxMessage.deleteMany();
    await prisma.diagnosticRun.deleteMany();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });
  async function requestAndReport() {
    const run = await start.execute({ organizationId, key: IdempotencyKey.of('transport-test') });
    const request = await prisma.outboxMessage.findFirstOrThrow();
    return diagnosticReportedV1.parse({
      ...fixture,
      payload: { ...fixture.payload, runId: run.id, requestId: request.id },
    });
  }
  it('ne marque publié qu’après confirmation ; un échec reste rejouable', async () => {
    await requestAndReport();
    await expect(
      store.publishNext(async () => {
        throw new Error('not confirmed');
      }),
    ).rejects.toThrow('not confirmed');
    expect(await prisma.outboxMessage.count({ where: { publishedAt: null } })).toBe(1);
    expect(await store.publishNext(async () => undefined)).toBe(true);
    expect(await prisma.outboxMessage.count({ where: { publishedAt: null } })).toBe(0);
    expect(
      await store.publishNext(async () => {
        throw new Error('déjà publié');
      }),
    ).toBe(false);
  });
  it('deux relais concurrents ne publient pas la même ligne verrouillée', async () => {
    await requestAndReport();
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const publishing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = store.publishNext(async () => {
      entered();
      await pending;
    });
    await Promise.race([publishing, first]);
    try {
      expect(
        await store.publishNext(async () => {
          throw new Error('ligne verrouillée');
        }),
      ).toBe(false);
    } finally {
      release();
      await first;
    }
  });
  it('ne conserve qu’un résultat terminal malgré redélivrance, recalcul et STARTED tardif', async () => {
    const report = await requestAndReport();
    await Promise.all([receive.execute(report), receive.execute(report)]);
    await receive.execute({ ...report, id: '0190f0a0-0000-7000-8000-000000000099' });
    await receive.execute({
      ...report,
      id: '0190f0a0-0000-7000-8000-000000000098',
      payload: { ...report.payload, report: { kind: 'STARTED' } },
    });
    const run = await runs.findById(organizationId, report.payload.runId);
    expect(run?.status).toBe('SUCCEEDED');
    expect(run?.outcome?.result.status).toBe('OPTIMAL');
    expect(await prisma.diagnosticEvent.count()).toBe(1);
    expect(await prisma.inboxReceipt.count()).toBe(3);
  });
  it('annule aussi le reçu inbox si l’événement ne peut pas être écrit', async () => {
    const report = await requestAndReport();
    await prisma.$executeRawUnsafe(
      `ALTER TABLE scheduling.diagnostic_events ADD CONSTRAINT test_no_event CHECK (false)`,
    );
    try {
      await expect(receive.execute(report)).rejects.toThrow();
      expect(await prisma.inboxReceipt.count()).toBe(0);
      expect((await runs.findById(organizationId, report.payload.runId))?.status).toBe('QUEUED');
    } finally {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE scheduling.diagnostic_events DROP CONSTRAINT test_no_event`,
      );
    }
    await receive.execute(report);
    expect(await prisma.diagnosticEvent.count()).toBe(1);
  });
  it('refuse une fausse attribution et ne modifie aucun job étranger', async () => {
    const report = await requestAndReport();
    await expect(
      receive.execute({ ...report, organizationId: '0190f0a0-0000-7000-8000-00000000000b' }),
    ).rejects.toThrow(UnmatchedDiagnosticReportError);
    await expect(
      receive.execute({
        ...report,
        payload: { ...report.payload, requestId: '0190f0a0-0000-7000-8000-0000000000ff' },
      }),
    ).rejects.toThrow(UnmatchedDiagnosticReportError);
    expect(await prisma.inboxReceipt.count()).toBe(0);
    expect(await prisma.diagnosticEvent.count()).toBe(0);
  });
});
