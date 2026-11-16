import { type Prisma, PrismaService, instantToDate } from '@trame/api/database';
import {
  type ScheduleReports,
  UnmatchedScheduleReportError,
} from '@trame/api/scheduling/application';
import type { ScheduleGeneration } from '@trame/api/scheduling/domain';
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
      await saveTransition(transaction, updated);
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

async function saveTransition(
  transaction: Prisma.TransactionClient,
  generation: ScheduleGeneration,
): Promise<void> {
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
    },
  });
}
