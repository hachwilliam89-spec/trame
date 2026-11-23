import { Injectable } from '@nestjs/common';
import { type Prisma, PrismaService, instantToDate, plainDateToDate } from '@trame/api/database';
import type {
  ScheduleGenerationRequest,
  ScheduleGenerations,
  WeekScheduleGenerations,
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

  async latestOfWeek(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<WeekScheduleGenerations> {
    const week = weekOf(organizationId, siteId, weekStartsOn);
    const withSchedule = SCHEDULE_STATUSES.map((status) => ({
      outcome: { path: ['result', 'status'], equals: status },
    }));
    const latestFirst: Prisma.ScheduleGenerationOrderByWithRelationInput[] = [
      { createdAt: 'desc' },
      { id: 'desc' },
    ];
    // Un seul instantané : une fin de calcul entre les deux lectures ne les rend pas incohérentes.
    return this.prisma.$transaction(
      async (transaction) => {
        const attempt = await transaction.scheduleGeneration.findFirst({
          where: week,
          orderBy: latestFirst,
        });
        const schedule = await transaction.scheduleGeneration.findFirst({
          where: { ...week, status: 'SUCCEEDED', OR: withSchedule },
          orderBy: latestFirst,
        });
        return {
          latestAttempt: attempt === null ? undefined : toScheduleGeneration(attempt),
          latestSchedule: schedule === null ? undefined : toScheduleGeneration(schedule),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
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
      problem, parameters, excluded_employees, absence_valuations, created_at
    )
    VALUES (
      ${generation.id}::uuid, ${generation.organizationId}::uuid, ${generation.siteId}::uuid,
      ${generation.weekStartsOn.toString()}::date, ${key.value}, ${generation.status},
      ${JSON.stringify(generation.problem)}::jsonb, ${JSON.stringify(generation.parameters)}::jsonb,
      ${JSON.stringify(generation.excludedEmployees)}::jsonb,
      ${JSON.stringify(generation.absenceValuations)}::jsonb, ${instantToDate(generation.createdAt)}
    )
    ON CONFLICT (organization_id, idempotency_key) DO NOTHING
    RETURNING id
  `;
  return inserted.length === 1;
}
