import { z } from 'zod';

/** assignment-smoke-v1 désigne exclusivement la petite matrice fixe du diagnostic Python. */
export const diagnosticRequestedV1 = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  type: z.literal('scheduling.diagnostic-requested.v1'),
  occurredAt: z.iso.datetime({ offset: true }),
  payload: z.object({
    runId: z.uuid(),
    problem: z.literal('assignment-smoke-v1'),
  }),
});
export type DiagnosticRequestedV1 = z.infer<typeof diagnosticRequestedV1>;
