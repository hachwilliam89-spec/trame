import { z } from 'zod';

export const transportSettings = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  AMQP_URL: z.url({ protocol: /^amqps?$/ }),
  DIAGNOSTIC_TOPOLOGY_FILE: z.string().min(1).default('infra/rabbitmq/diagnostic-topology.json'),
  SCHEDULE_TOPOLOGY_FILE: z.string().min(1).default('infra/rabbitmq/schedule-topology.json'),
  /** Fichier de vie lu par la sonde du conteneur ; absent en local, où rien ne le lit. */
  RELAY_LIVENESS_FILE: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type TransportSettings = z.infer<typeof transportSettings>;
