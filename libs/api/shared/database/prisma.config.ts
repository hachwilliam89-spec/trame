import { defineConfig } from 'prisma/config';

// Prisma 7 : l'URL de connexion vient de la configuration, plus du schéma.
// `prisma generate` n'a pas besoin de base ; une URL factice suffit hors migration.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://trame:trame@localhost:5432/trame',
  },
});
