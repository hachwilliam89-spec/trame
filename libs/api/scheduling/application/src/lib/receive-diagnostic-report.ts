import { advanceDiagnostic, type DiagnosticRun } from '@trame/api/scheduling/domain';
import type { Clock } from '@trame/platform/clock';
import type { DiagnosticReportedV1 } from '@trame/shared/contracts';

export class UnmatchedDiagnosticReportError extends Error {
  constructor() {
    super('Rapport sans demande correspondante.');
  }
}
export interface DiagnosticReports {
  /** Dédoublonnage, vérification de la demande, verrou et écriture atomiques. */
  accept(
    message: DiagnosticReportedV1,
    decide: (run: DiagnosticRun) => DiagnosticRun | undefined,
  ): Promise<void>;
}
export class ReceiveDiagnosticReport {
  constructor(
    private readonly reports: DiagnosticReports,
    private readonly clock: Clock,
  ) {}
  execute(message: DiagnosticReportedV1): Promise<void> {
    return this.reports.accept(message, (run) =>
      advanceDiagnostic(run, message.payload.report, this.clock.now()),
    );
  }
}
