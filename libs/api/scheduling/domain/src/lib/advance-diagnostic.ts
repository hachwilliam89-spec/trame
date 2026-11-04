import type { DiagnosticReportV1 } from '@trame/shared/contracts';
import type { DiagnosticRun } from '../index';

/** Un événement tardif ne peut ni rouvrir un traitement ni remplacer son résultat. */
export function advanceDiagnostic(
  run: DiagnosticRun,
  report: DiagnosticReportV1,
  now: Temporal.Instant,
): DiagnosticRun | undefined {
  if (run.status === 'SUCCEEDED' || run.status === 'FAILED') {
    return undefined;
  }
  switch (report.kind) {
    case 'STARTED':
      if (run.status === 'RUNNING') {
        return undefined;
      }
      return { ...run, status: 'RUNNING' };
    case 'RESULT':
      return { ...run, status: 'SUCCEEDED', outcome: report.outcome, finishedAt: now };
    case 'FAILED':
      return { ...run, status: 'FAILED', failure: report.code, finishedAt: now };
  }
}
