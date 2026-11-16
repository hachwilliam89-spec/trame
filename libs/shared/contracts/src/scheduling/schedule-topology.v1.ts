import type * as z from 'zod';
import { queueTopology } from './queue-topology.v1';

/** Files de la génération d'un planning : `infra/rabbitmq/schedule-topology.json`. */
export const scheduleTopologyV1 = queueTopology();

export type ScheduleTopologyV1 = z.infer<typeof scheduleTopologyV1>;
