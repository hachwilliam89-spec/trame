import { z } from 'zod';
import { diagnosticReportV1 } from './diagnostic-report.v1';

/** Événement SSE public ; runId relie la requête, le worker et le résultat. */
export const diagnosticProgressV1 = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  sequence: z.int().positive(),
  occurredAt: z.iso.datetime({ offset: true }),
  report: diagnosticReportV1,
});
export type DiagnosticProgressV1 = z.infer<typeof diagnosticProgressV1>;
