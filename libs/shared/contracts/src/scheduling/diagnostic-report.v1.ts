import { z } from 'zod';

const solutionV1 = z.object({
  cost: z.int(),
  assignment: z.array(z.int().min(0).max(2)).length(3),
});
export const diagnosticResultV1 = z.discriminatedUnion('status', [
  z.object({ status: z.literal('OPTIMAL'), solution: solutionV1 }),
  z.object({ status: z.literal('FEASIBLE'), solution: solutionV1 }),
  z.object({ status: z.literal('INFEASIBLE'), solution: z.null() }),
  z.object({ status: z.literal('UNKNOWN'), solution: z.null() }),
  z.object({ status: z.literal('CANCELLED'), solution: solutionV1.nullable() }),
]);
export const diagnosticOutcomeV1 = z.object({
  result: diagnosticResultV1,
  problem: z.object({
    name: z.literal('assignment-smoke-v1'),
    costs: z.array(z.array(z.int()).length(3)).length(3),
  }),
  parameters: z.object({
    workers: z.literal(1),
    seed: z.literal(0),
    timeLimitSeconds: z.literal(5),
  }),
});
export const diagnosticFailureV1 = z.enum([
  'INVALID_MODEL',
  'PROCESSING_FAILED',
  'RETRIES_EXHAUSTED',
]);
export const diagnosticReportV1 = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('STARTED') }),
  z.object({ kind: z.literal('RESULT'), outcome: diagnosticOutcomeV1 }),
  z.object({ kind: z.literal('FAILED'), code: diagnosticFailureV1 }),
]);
export const diagnosticReportedV1 = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  type: z.literal('scheduling.diagnostic-reported.v1'),
  occurredAt: z.iso.datetime({ offset: true }),
  payload: z.object({ runId: z.uuid(), requestId: z.uuid(), report: diagnosticReportV1 }),
});
export type DiagnosticOutcomeV1 = z.infer<typeof diagnosticOutcomeV1>;
export type DiagnosticFailureV1 = z.infer<typeof diagnosticFailureV1>;
export type DiagnosticReportV1 = z.infer<typeof diagnosticReportV1>;
export type DiagnosticReportedV1 = z.infer<typeof diagnosticReportedV1>;
