import { advanceGeneration, type ScheduleGeneration } from '@trame/api/scheduling/domain';
import type { Clock } from '@trame/platform/clock';
import type { ScheduleReportedV1 } from '@trame/shared/contracts';

/** Le rapport ne répond à aucune demande de cette organisation : il est refusé définitivement. */
export class UnmatchedScheduleReportError extends Error {
  constructor() {
    super('Rapport sans demande de génération correspondante.');
  }
}

export interface ScheduleReports {
  /**
   * Vérifie que le rapport répond à la demande publiée, le dédoublonne (inbox), verrouille la
   * génération et enregistre la décision, en une transaction.
   */
  accept(
    message: ScheduleReportedV1,
    decide: (generation: ScheduleGeneration) => ScheduleGeneration | undefined,
  ): Promise<void>;
}

export class ReceiveScheduleReport {
  constructor(
    private readonly reports: ScheduleReports,
    private readonly clock: Clock,
  ) {}

  execute(message: ScheduleReportedV1): Promise<void> {
    return this.reports.accept(message, (generation) =>
      advanceGeneration(generation, message.payload.report, this.clock.now()),
    );
  }
}
