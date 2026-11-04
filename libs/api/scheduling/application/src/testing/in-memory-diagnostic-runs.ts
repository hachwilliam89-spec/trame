import type { DiagnosticRun } from '@trame/api/scheduling/domain';
import type { DiagnosticRunRequest, DiagnosticRuns } from '../lib/diagnostic-runs';

export class InMemoryDiagnosticRuns implements DiagnosticRuns {
  readonly requests = new Map<string, DiagnosticRunRequest>();

  async register(request: DiagnosticRunRequest): Promise<DiagnosticRun> {
    const key = JSON.stringify([request.run.organizationId, request.key.value]);
    const existing = this.requests.get(key);
    if (existing !== undefined) {
      return existing.run;
    }
    this.requests.set(key, request);
    return request.run;
  }

  async findById(organizationId: string, runId: string): Promise<DiagnosticRun | undefined> {
    for (const { run } of this.requests.values()) {
      if (run.organizationId === organizationId && run.id === runId) {
        return run;
      }
    }
    return undefined;
  }
}
