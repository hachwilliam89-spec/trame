import { z } from 'zod';

/** Environnement de l'API, validé au démarrage (`@trame/platform/config`). */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Une adresse IP, jamais un nom : l'écoute reste explicite. `127.0.0.1` garde l'API sur le poste ;
  // un conteneur passe `0.0.0.0` pour être joignable par le proxy (US-005).
  HOST: z.union([z.ipv4(), z.ipv6()]).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type Env = z.output<typeof envSchema>;
