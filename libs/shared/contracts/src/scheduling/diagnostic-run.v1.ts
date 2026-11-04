import { z } from 'zod';

/** Aucune entrée de calcul arbitraire ; même une organisation fournie est refusée. */
export const startDiagnosticRequestV1 = z.strictObject({});
export const diagnosticRunStatusV1 = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']);
export const diagnosticRunV1 = z.object({
  id: z.uuid(),
  status: diagnosticRunStatusV1,
  createdAt: z.iso.datetime(),
});
export type DiagnosticRunV1 = z.infer<typeof diagnosticRunV1>;
