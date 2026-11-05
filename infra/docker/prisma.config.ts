import { defineConfig, env } from 'prisma/config';

// Le migrateur ne doit jamais choisir silencieusement une base locale par défaut.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
