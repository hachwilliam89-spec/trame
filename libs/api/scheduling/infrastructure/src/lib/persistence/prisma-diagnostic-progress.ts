import { Injectable } from '@nestjs/common';
import { PrismaService, instantToDate } from '@trame/api/database';
import type {
  DiagnosticProgress,
  ProgressQuery,
  ProgressSnapshot,
} from '@trame/api/scheduling/application';
import { diagnosticReportedV1, diagnosticProgressV1 } from '@trame/shared/contracts';

@Injectable()
export class PrismaDiagnosticProgress implements DiagnosticProgress {
  constructor(private readonly prisma: PrismaService) {}

  async read(query: ProgressQuery): Promise<ProgressSnapshot | undefined> {
    return this.prisma.$transaction(
      async (transaction) => {
        const { organizationId, runId, after } = query;
        const run = await transaction.diagnosticRun.findFirst({
          where: { id: runId, organizationId },
        });
        if (run === null) return undefined;
        const cursor =
          after === undefined
            ? null
            : await transaction.diagnosticEvent.findFirst({
                where: { id: after, runId, organizationId },
              });
        const records = await transaction.diagnosticEvent.findMany({
          where: { runId, organizationId, sequence: { gt: cursor?.sequence ?? 0 } },
          orderBy: { sequence: 'asc' },
          take: 50,
        });
        return {
          cursorKnown: after === undefined || cursor !== null,
          finishedAt:
            run.finishedAt === null
              ? undefined
              : Temporal.Instant.from(run.finishedAt.toISOString()),
          events: records.map((record) => {
            const message = diagnosticReportedV1.parse(record.body);
            return diagnosticProgressV1.parse({
              id: record.id,
              runId,
              sequence: record.sequence,
              occurredAt: record.occurredAt.toISOString(),
              report: message.payload.report,
            });
          }),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async purgeFinishedBefore(instant: Temporal.Instant): Promise<number> {
    // Maintenance globale, jamais exposée en HTTP. Seuls les événements sont supprimés.
    const removed = await this.prisma.diagnosticEvent.deleteMany({
      where: { run: { finishedAt: { lte: instantToDate(instant) } } },
    });
    return removed.count;
  }
}
