import { type Prisma, dateToInstant } from '@trame/api/database';
import type { DiagnosticRun } from '@trame/api/scheduling/domain';
import {
  diagnosticFailureV1,
  diagnosticOutcomeV1,
  diagnosticRunStatusV1,
} from '@trame/shared/contracts';
export function toDiagnosticRun(record: Prisma.DiagnosticRunModel): DiagnosticRun {
  return {
    id: record.id,
    organizationId: record.organizationId,
    status: diagnosticRunStatusV1.parse(record.status),
    createdAt: dateToInstant(record.createdAt),
    ...(record.outcome === null ? {} : { outcome: diagnosticOutcomeV1.parse(record.outcome) }),
    ...(record.failure === null ? {} : { failure: diagnosticFailureV1.parse(record.failure) }),
    ...(record.finishedAt === null ? {} : { finishedAt: dateToInstant(record.finishedAt) }),
  };
}
