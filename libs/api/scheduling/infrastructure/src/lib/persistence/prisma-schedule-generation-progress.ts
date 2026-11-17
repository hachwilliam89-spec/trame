import { Injectable } from '@nestjs/common';
import { PrismaService, dateToInstant } from '@trame/api/database';
import type {
  ScheduleGenerationProgress,
  ScheduleGenerationProgressQuery,
  ScheduleGenerationProgressSnapshot,
} from '@trame/api/scheduling/application';
import { scheduleGenerationProgressV1 } from '@trame/shared/contracts';

const BATCH_SIZE = 50;

@Injectable()
export class PrismaScheduleGenerationProgress implements ScheduleGenerationProgress {
  constructor(private readonly prisma: PrismaService) {}

  /** Lecture cohérente : la génération et ses événements vus au même instant. */
  async read(
    query: ScheduleGenerationProgressQuery,
  ): Promise<ScheduleGenerationProgressSnapshot | undefined> {
    return this.prisma.$transaction(
      async (transaction) => {
        const { organizationId, generationId, after } = query;
        const generation = await transaction.scheduleGeneration.findFirst({
          where: { id: generationId, organizationId },
          select: { finishedAt: true },
        });
        if (generation === null) {
          return undefined;
        }
        const cursor =
          after === undefined
            ? null
            : await transaction.scheduleGenerationEvent.findFirst({
                where: { id: after, generationId, organizationId },
              });
        const records = await transaction.scheduleGenerationEvent.findMany({
          where: { generationId, organizationId, sequence: { gt: cursor?.sequence ?? 0 } },
          orderBy: { sequence: 'asc' },
          take: BATCH_SIZE,
        });
        return {
          cursorKnown: after === undefined || cursor !== null,
          ...(generation.finishedAt === null
            ? {}
            : { finishedAt: dateToInstant(generation.finishedAt) }),
          events: records.map((record) =>
            scheduleGenerationProgressV1.parse({
              id: record.id,
              generationId,
              sequence: record.sequence,
              occurredAt: record.occurredAt.toISOString(),
              status: record.status,
              ...(record.resultStatus === null ? {} : { resultStatus: record.resultStatus }),
              ...(record.failure === null ? {} : { failure: record.failure }),
            }),
          ),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
