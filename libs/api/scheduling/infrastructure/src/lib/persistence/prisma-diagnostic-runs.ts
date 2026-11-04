import { Injectable } from '@nestjs/common';
import { type Prisma, PrismaService, dateToInstant, instantToDate } from '@trame/api/database';
import type { DiagnosticRunRequest, DiagnosticRuns } from '@trame/api/scheduling/application';
import type { DiagnosticRun } from '@trame/api/scheduling/domain';
import { diagnosticRequestedV1, diagnosticRunStatusV1 } from '@trame/shared/contracts';

/** La contrainte unique arbitre le double clic ; le message n'est ajouté que par le gagnant. */
@Injectable()
export class PrismaDiagnosticRuns implements DiagnosticRuns {
  constructor(private readonly prisma: PrismaService) {}

  async register(request: DiagnosticRunRequest): Promise<DiagnosticRun> {
    const message = diagnosticRequestedV1.parse(request.message);
    return this.prisma.$transaction(
      async (transaction) => {
        const inserted = await insertRun(transaction, request);
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
        // Après ON CONFLICT, une nouvelle instruction voit le gagnant désormais validé.
        const record = await transaction.diagnosticRun.findUniqueOrThrow({
          where: {
            organizationId_idempotencyKey: {
              organizationId: request.run.organizationId,
              idempotencyKey: request.key.value,
            },
          },
        });
        return toRun(record);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async findById(organizationId: string, runId: string): Promise<DiagnosticRun | undefined> {
    const record = await this.prisma.diagnosticRun.findFirst({
      where: { id: runId, organizationId },
    });
    if (record === null) {
      return undefined;
    }
    return toRun(record);
  }
}

async function insertRun(
  transaction: Prisma.TransactionClient,
  request: DiagnosticRunRequest,
): Promise<boolean> {
  const { run, key } = request;
  // Cible explicite : une autre violation d'unicité reste une erreur, pas un rejeu.
  const inserted = await transaction.$queryRaw<{ id: string }[]>`
    INSERT INTO scheduling.diagnostic_runs (id, organization_id, idempotency_key, status, created_at)
    VALUES (${run.id}::uuid, ${run.organizationId}::uuid, ${key.value}, ${run.status}, ${instantToDate(run.createdAt)})
    ON CONFLICT (organization_id, idempotency_key) DO NOTHING
    RETURNING id
  `;
  return inserted.length === 1;
}

function toRun(record: Prisma.DiagnosticRunModel): DiagnosticRun {
  return {
    id: record.id,
    organizationId: record.organizationId,
    status: diagnosticRunStatusV1.parse(record.status),
    createdAt: dateToInstant(record.createdAt),
  };
}
