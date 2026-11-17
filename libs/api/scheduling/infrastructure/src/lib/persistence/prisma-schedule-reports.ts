import { type Prisma, PrismaService, instantToDate } from '@trame/api/database';
import {
  type ScheduleReports,
  UnmatchedScheduleReportError,
} from '@trame/api/scheduling/application';
import { progressStateOf, type ScheduleGeneration } from '@trame/api/scheduling/domain';
import type { Clock } from '@trame/platform/clock';
import { type ScheduleReportedV1, scheduleRequestedV1 } from '@trame/shared/contracts';
import { toScheduleGeneration } from './generation-record';

export class PrismaScheduleReports implements ScheduleReports {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async accept(
    message: ScheduleReportedV1,
    decide: (generation: ScheduleGeneration) => ScheduleGeneration | undefined,
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
      await lockGeneration(transaction, message);
      const record = await transaction.scheduleGeneration.findUniqueOrThrow({
        where: {
          id_organizationId: {
            id: message.payload.generationId,
            organizationId: message.organizationId,
          },
        },
      });
      // Une décision refusée (planning incohérent) annule aussi le reçu : le rapport part en rebut.
      const updated = decide(toScheduleGeneration(record));
      if (updated === undefined) {
        return;
      }
      await saveTransition(transaction, updated, message, record.lastSequence + 1);
    });
  }
}

/** Le rapport répond à la demande publiée pour cette génération, dans cette organisation. */
async function matchRequest(
  transaction: Prisma.TransactionClient,
  message: ScheduleReportedV1,
): Promise<void> {
  const request = await transaction.outboxMessage.findFirst({
    where: { id: message.payload.requestId, organizationId: message.organizationId },
  });
  const parsed = scheduleRequestedV1.safeParse(request?.body);
  if (
    !parsed.success ||
    parsed.data.payload.generationId !== message.payload.generationId ||
    parsed.data.organizationId !== message.organizationId
  ) {
    throw new UnmatchedScheduleReportError();
  }
}

async function lockGeneration(
  transaction: Prisma.TransactionClient,
  message: ScheduleReportedV1,
): Promise<void> {
  const locked = await transaction.$queryRaw<{ id: string }[]>`
    SELECT id FROM scheduling.schedule_generations
    WHERE id = ${message.payload.generationId}::uuid
      AND organization_id = ${message.organizationId}::uuid
    FOR UPDATE
  `;
  if (locked.length === 0) {
    throw new UnmatchedScheduleReportError();
  }
}

/** La génération et son événement de progression, numéroté à la suite, dans la même transaction. */
async function saveTransition(
  transaction: Prisma.TransactionClient,
  generation: ScheduleGeneration,
  message: ScheduleReportedV1,
  sequence: number,
): Promise<void> {
  const state = progressStateOf(generation);
  await transaction.scheduleGeneration.update({
    where: {
      id_organizationId: { id: generation.id, organizationId: generation.organizationId },
    },
    data: {
      status: generation.status,
      outcome: generation.outcome,
      failure: generation.failure,
      finishedAt:
        generation.finishedAt === undefined ? undefined : instantToDate(generation.finishedAt),
      lastSequence: state === undefined ? undefined : sequence,
    },
  });
  if (state === undefined) {
    return;
  }
  await transaction.scheduleGenerationEvent.create({
    data: {
      id: message.id,
      organizationId: generation.organizationId,
      generationId: generation.id,
      sequence,
      status: state.status,
      resultStatus: state.resultStatus,
      failure: state.failure,
      occurredAt: new Date(message.occurredAt),
    },
  });
}
