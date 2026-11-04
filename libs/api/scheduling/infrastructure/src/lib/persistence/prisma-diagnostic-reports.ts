import { type Prisma, PrismaService, instantToDate } from '@trame/api/database';
import {
  UnmatchedDiagnosticReportError,
  type DiagnosticReports,
} from '@trame/api/scheduling/application';
import type { DiagnosticRun } from '@trame/api/scheduling/domain';
import type { Clock } from '@trame/platform/clock';
import { type DiagnosticReportedV1, diagnosticRequestedV1 } from '@trame/shared/contracts';
import { toDiagnosticRun } from './diagnostic-record';

export class PrismaDiagnosticReports implements DiagnosticReports {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async accept(
    message: DiagnosticReportedV1,
    decide: (run: DiagnosticRun) => DiagnosticRun | undefined,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await matchRequest(transaction, message);
      const receipt = await transaction.inboxReceipt.createMany({
        skipDuplicates: true,
        data: {
          id: message.id,
          organizationId: message.organizationId,
          receivedAt: instantToDate(this.clock.now()),
        },
      });
      if (receipt.count === 0) {
        return;
      }
      await lockRun(transaction, message);
      const record = await transaction.diagnosticRun.findUniqueOrThrow({
        where: {
          id_organizationId: {
            id: message.payload.runId,
            organizationId: message.organizationId,
          },
        },
      });
      const updated = decide(toDiagnosticRun(record));
      if (updated === undefined) {
        return;
      }
      await saveTransition(transaction, updated, message, record.lastSequence + 1);
    });
  }
}

async function matchRequest(
  transaction: Prisma.TransactionClient,
  message: DiagnosticReportedV1,
): Promise<void> {
  const request = await transaction.outboxMessage.findFirst({
    where: { id: message.payload.requestId, organizationId: message.organizationId },
  });
  const parsed = diagnosticRequestedV1.safeParse(request?.body);
  if (
    !parsed.success ||
    parsed.data.payload.runId !== message.payload.runId ||
    parsed.data.organizationId !== message.organizationId
  ) {
    throw new UnmatchedDiagnosticReportError();
  }
}

async function lockRun(
  transaction: Prisma.TransactionClient,
  message: DiagnosticReportedV1,
): Promise<void> {
  const locked = await transaction.$queryRaw<{ id: string }[]>`
    SELECT id FROM scheduling.diagnostic_runs
    WHERE id = ${message.payload.runId}::uuid AND organization_id = ${message.organizationId}::uuid
    FOR UPDATE
  `;
  if (locked.length === 0) {
    throw new UnmatchedDiagnosticReportError();
  }
}

async function saveTransition(
  transaction: Prisma.TransactionClient,
  run: DiagnosticRun,
  message: DiagnosticReportedV1,
  sequence: number,
): Promise<void> {
  await transaction.diagnosticRun.update({
    where: { id_organizationId: { id: run.id, organizationId: run.organizationId } },
    data: {
      status: run.status,
      lastSequence: sequence,
      outcome: run.outcome,
      failure: run.failure,
      finishedAt: run.finishedAt === undefined ? undefined : instantToDate(run.finishedAt),
    },
  });
  await transaction.diagnosticEvent.create({
    data: {
      id: message.id,
      organizationId: run.organizationId,
      runId: run.id,
      sequence,
      body: message,
      occurredAt: new Date(message.occurredAt),
    },
  });
}
