import type { DiagnosticOutcomeV1, DiagnosticFailureV1 } from '@trame/shared/contracts';
/** État du traitement technique ; les issues du solveur seront portées par son résultat. */
export type DiagnosticRunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface DiagnosticRun {
  readonly id: string;
  readonly organizationId: string;
  readonly status: DiagnosticRunStatus;
  readonly createdAt: Temporal.Instant;
  readonly outcome?: DiagnosticOutcomeV1;
  readonly failure?: DiagnosticFailureV1;
  readonly finishedAt?: Temporal.Instant;
}

/** Problème fictif fixe, sans paramètre de calcul fourni par le client. */
export interface DiagnosticRequest {
  readonly runId: string;
  readonly problem: 'assignment-smoke-v1';
}

export { advanceDiagnostic } from './lib/advance-diagnostic';
