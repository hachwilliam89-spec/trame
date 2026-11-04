import type { DiagnosticRun } from '@trame/api/scheduling/domain';
import type { DiagnosticRuns } from './diagnostic-runs';

export class DiagnosticNotFoundError extends Error {
  constructor() {
    super('Diagnostic introuvable.');
  }
}

export class GetDiagnostic {
  constructor(private readonly runs: DiagnosticRuns) {}
  async execute(query: { organizationId: string; runId: string }): Promise<DiagnosticRun> {
    const run = await this.runs.findById(query.organizationId, query.runId);
    if (run === undefined) {
      throw new DiagnosticNotFoundError();
    }
    return run;
  }
}
