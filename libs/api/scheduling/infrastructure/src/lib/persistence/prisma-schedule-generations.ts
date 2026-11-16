import { Injectable } from '@nestjs/common';
import { type Prisma, PrismaService, instantToDate, plainDateToDate } from '@trame/api/database';
import type {
  ScheduleGenerationRequest,
  ScheduleGenerations,
} from '@trame/api/scheduling/application';
import { SCHEDULE_STATUSES, type ScheduleGeneration } from '@trame/api/scheduling/domain';
import type { IdempotencyKey } from '@trame/platform/idempotency';
import { scheduleRequestedV1 } from '@trame/shared/contracts';
import { toScheduleGeneration } from './generation-record';

@Injectable()
export class PrismaScheduleGenerations implements ScheduleGenerations {
  constructor(private readonly prisma: PrismaService) {}

  async register(request: ScheduleGenerationRequest): Promise<ScheduleGeneration> {
    const message = scheduleRequestedV1.parse(request.message);
    return this.prisma.$transaction(
      async (transaction) => {
        const inserted = await insertGeneration(transaction, request);
        if (inserted) {
          await transaction.outboxMessage.create({
            data: {
              id: message.id,
              organizationId: message.organizationId,
              type: message.type,
              occurredAt: new Date(message.occurredAt),
              body: message,
            },
          });
        }
        // Après ON CONFLICT, une nouvelle instruction voit la gagnante désormais validée.
        const record = await transaction.scheduleGeneration.findUniqueOrThrow({
          where: {
            organizationId_idempotencyKey: {
              organizationId: request.generation.organizationId,
              idempotencyKey: request.key.value,
            },
          },
        });
        return toScheduleGeneration(record);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async findByKey(
    organizationId: string,
    key: IdempotencyKey,
  ): Promise<ScheduleGeneration | undefined> {
    const record = await this.prisma.scheduleGeneration.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: key.value } },
    });
    return record === null ? undefined : toScheduleGeneration(record);
  }

  async findById(
    organizationId: string,
    generationId: string,
  ): Promise<ScheduleGeneration | undefined> {
    const record = await this.prisma.scheduleGeneration.findFirst({
      where: { id: generationId, organizationId },
    });
    return record === null ? undefined : toScheduleGeneration(record);
  }

  async latestAttempt(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<ScheduleGeneration | undefined> {
    const record = await this.prisma.scheduleGeneration.findFirst({
      where: weekOf(organizationId, siteId, weekStartsOn),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return record === null ? undefined : toScheduleGeneration(record);
  }

  async latestWithSchedule(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<ScheduleGeneration | undefined> {
    const withSchedule = SCHEDULE_STATUSES.map((status) => ({
      outcome: { path: ['result', 'status'], equals: status },
    }));
    const record = await this.prisma.scheduleGeneration.findFirst({
      where: {
        ...weekOf(organizationId, siteId, weekStartsOn),
        status: 'SUCCEEDED',
        OR: withSchedule,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return record === null ? undefined : toScheduleGeneration(record);
  }
}

function weekOf(
  organizationId: string,
  siteId: string,
  weekStartsOn: Temporal.PlainDate,
): Prisma.ScheduleGenerationWhereInput {
  return { organizationId, siteId, weekStartsOn: plainDateToDate(weekStartsOn) };
}

async function insertGeneration(
  transaction: Prisma.TransactionClient,
  request: ScheduleGenerationRequest,
): Promise<boolean> {
  const { generation, key } = request;
  // Cible explicite : une autre violation d'unicité reste une erreur, pas un rejeu.
  const inserted = await transaction.$queryRaw<{ id: string }[]>`
    INSERT INTO scheduling.schedule_generations (
      id, organization_id, site_id, week_starts_on, idempotency_key, status,
      problem, parameters, excluded_employees, created_at
    )
    VALUES (
      ${generation.id}::uuid, ${generation.organizationId}::uuid, ${generation.siteId}::uuid,
      ${generation.weekStartsOn.toString()}::date, ${key.value}, ${generation.status},
      ${JSON.stringify(generation.problem)}::jsonb, ${JSON.stringify(generation.parameters)}::jsonb,
      ${JSON.stringify(generation.excludedEmployees)}::jsonb, ${instantToDate(generation.createdAt)}
    )
    ON CONFLICT (organization_id, idempotency_key) DO NOTHING
    RETURNING id
  `;
  return inserted.length === 1;
}
