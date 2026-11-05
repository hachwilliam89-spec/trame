import * as z from 'zod';
import { diagnosticOutcomeV1, diagnosticFailureV1 } from './diagnostic-report.v1';

/** Aucune entrée de calcul arbitraire ; même une organisation fournie est refusée. */
export const startDiagnosticRequestV1 = z.strictObject({});
export const diagnosticRunStatusV1 = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']);
export const diagnosticRunV1 = z.object({
  id: z.uuid(),
  status: diagnosticRunStatusV1,
  createdAt: z.iso.datetime(),
  outcome: diagnosticOutcomeV1.optional(),
  failure: diagnosticFailureV1.optional(),
  finishedAt: z.iso.datetime().optional(),
});
export type DiagnosticRunV1 = z.infer<typeof diagnosticRunV1>;
