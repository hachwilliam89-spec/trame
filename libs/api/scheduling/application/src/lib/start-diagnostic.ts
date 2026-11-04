import type { DiagnosticRequest, DiagnosticRun } from '@trame/api/scheduling/domain';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import type { IdempotencyKey } from '@trame/platform/idempotency';
import { prepareOutboxMessage } from '@trame/platform/outbox';
import type { DiagnosticRuns } from './diagnostic-runs';

export interface StartDiagnosticCommand {
  organizationId: string;
  key: IdempotencyKey;
}

export class StartDiagnostic {
  constructor(
    private readonly runs: DiagnosticRuns,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}
  execute(command: StartDiagnosticCommand): Promise<DiagnosticRun> {
    const run: DiagnosticRun = {
      id: this.ids.next(),
      organizationId: command.organizationId,
      status: 'QUEUED',
      createdAt: this.clock.now(),
    };
    const message = prepareOutboxMessage<DiagnosticRequest>(
      {
        organizationId: run.organizationId,
        type: 'scheduling.diagnostic-requested.v1',
        payload: { runId: run.id, problem: 'assignment-smoke-v1' },
      },
      this.clock,
      this.ids,
    );
    return this.runs.register({ run, key: command.key, message });
  }
}
