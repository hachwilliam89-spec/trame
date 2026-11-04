import type { DiagnosticRequest, DiagnosticRun } from '@trame/api/scheduling/domain';
import type { IdempotencyKey } from '@trame/platform/idempotency';
import type { OutboxMessage } from '@trame/platform/outbox';

export interface DiagnosticRunRequest {
  run: DiagnosticRun;
  key: IdempotencyKey;
  message: OutboxMessage<DiagnosticRequest>;
}

export interface DiagnosticRuns {
  /** Crée job et message ensemble, ou retrouve le job de cette organisation et cette clé. */
  register(request: DiagnosticRunRequest): Promise<DiagnosticRun>;
  findById(organizationId: string, runId: string): Promise<DiagnosticRun | undefined>;
}
