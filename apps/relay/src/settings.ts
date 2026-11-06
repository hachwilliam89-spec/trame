import { z } from 'zod';
export const transportSettings = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  AMQP_URL: z.url({ protocol: /^amqps?$/ }),
  DIAGNOSTIC_TOPOLOGY_FILE: z.string().min(1).default('infra/rabbitmq/diagnostic-topology.json'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});
