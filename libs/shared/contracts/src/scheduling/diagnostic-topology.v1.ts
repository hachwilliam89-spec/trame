import { z } from 'zod';
const declaration = z.object({
  name: z.string().min(1),
  routingKey: z.string().min(1),
  arguments: z.record(z.string(), z.union([z.string(), z.int(), z.boolean()])),
});
export const diagnosticTopologyV1 = z.object({
  exchange: z.string().min(1),
  requests: declaration,
  reports: declaration,
  deadLetters: declaration,
  parking: declaration,
});
export type DiagnosticTopologyV1 = z.infer<typeof diagnosticTopologyV1>;
