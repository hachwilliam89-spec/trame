# `@trame/api/database`

Accès PostgreSQL de l'API : Prisma 7 avec l'adaptateur `@prisma/adapter-pg` (ADR-0008, ADR-0022). Propre à Trame : le schéma décrit ses données.

- `prisma/schema.prisma` : un schéma Postgres par bounded context (`schemas = [...]`), sans relation entre contextes.
- `prisma.config.ts` : configuration Prisma 7 (URL via `DATABASE_URL`, migrations dans `prisma/migrations`).
- `PrismaService` : client Prisma injectable, réservé aux adaptateurs `infrastructure`.
- `DatabaseReadiness` : indicateur `database` de `health/ready`.
- `DatabaseModule.forRootAsync({ inject, useFactory: () => ({ url }) })`.

Le client est généré dans `src/generated/prisma` (ignoré par Git) :

```bash
pnpm nx run api-database:prisma-generate
pnpm nx run api-database:prisma-migrate -- --name <nom>   # nouvelle migration (base locale requise)
pnpm nx run api-database:integration                       # Docker requis (Testcontainers)
```

Migrations en expand/contract : une migration ne casse jamais la version précédente de l'API. Une migration mergée ne se modifie plus.
