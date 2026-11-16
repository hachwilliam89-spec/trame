import { z } from 'zod';
import { queueTopology } from './queue-topology.v1';

export const diagnosticTopologyV1 = queueTopology();
export type DiagnosticTopologyV1 = z.infer<typeof diagnosticTopologyV1>;
