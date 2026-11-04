# `@trame/api/database`

Accès PostgreSQL de l'API : Prisma 7 avec l'adaptateur `@prisma/adapter-pg` (ADR-0008, ADR-0022). Propre à Trame : le schéma décrit ses données.

- `prisma/schema.prisma` : un schéma Postgres par bounded context (`schemas = [...]`), sans relation entre contextes.
- `prisma.config.ts` : configuration Prisma 7 (URL via `DATABASE_URL`, migrations dans `prisma/migrations`).
- `PrismaService` : client Prisma injectable, réservé aux adaptateurs `infrastructure`.
- `DatabaseReadiness` : indicateur `database` de `health/ready`.
- `DatabaseModule.forRootAsync({ inject, useFactory: () => ({ url }) })`.
- `isUniqueViolation(error)` : vrai pour une violation de contrainte d'unicité (P2002). Un dépôt la traduit en erreur métier.
- `instantToDate` et `dateToInstant` : conversion entre `Temporal.Instant` et le `Date` de Prisma, à la frontière.
- `Prisma` (type) : types des enregistrements, par exemple `Prisma.SiteModel`.

## Schéma par contexte

| Contexte       | Schéma Postgres | Tables                                                                      |
| -------------- | --------------- | --------------------------------------------------------------------------- |
| `organization` | `organization`  | `sites`, `shift_templates`, `skills`, `positions`, `position_skills`        |
| `scheduling`   | `scheduling`    | `diagnostic_runs`, `outbox_messages`, `inbox_receipts`, `diagnostic_events` |

- Un agrégat enfant porte l'organisation de son parent, et la clé étrangère est composite (`site_id`, `organization_id`) : la base garantit qu'un créneau type appartient à l'organisation de son site.
- Les contraintes que Prisma n'exprime pas (CHECK) sont ajoutées à la main en fin de migration, avec un commentaire. `prisma migrate diff` les ignore.

## Tests

`@trame/api/database/testing` fournit `startTestDatabase()` : un vrai PostgreSQL (Testcontainers), une base dédiée au fichier de test, et toutes les migrations appliquées. `TEST_DATABASE_URL` vise un serveur déjà démarré quand Docker n'est pas disponible.

La CI vérifie aussi, contre un PostgreSQL de service, que `prisma migrate deploy` applique les migrations et qu'aucun écart ne reste avec `schema.prisma` (`pnpm nx run api-database:migrations-check`).

Le client est généré dans `src/generated/prisma` (ignoré par Git) :

```bash
pnpm nx run api-database:prisma-generate
pnpm nx run api-database:prisma-migrate -- --name <nom>   # nouvelle migration (base locale requise)
pnpm nx run api-database:integration                       # Docker requis (Testcontainers)
pnpm nx run api-database:migrations-check                  # migrations appliquées, aucun écart (DATABASE_URL)
```

Migrations en expand/contract : une migration ne casse jamais la version précédente de l'API. Une migration mergée ne se modifie plus.

Le processus de transport peut passer `requestTimeoutMs` à `PrismaService` pour borner
la connexion et chaque requête SQL. Ce réglage reste facultatif : les autres consommateurs
gardent les valeurs du pilote.

Les tests de panne utilisent `startTestDatabase({ faultInjection: true })` : un serveur Docker
propre au test, même si `TEST_DATABASE_URL` existe, et un port fixe au redémarrage.
`setServerAvailable(false/true)` arrête puis redémarre uniquement ce conteneur possédé par le
test. Une base externe ne peut pas être arrêtée par ce helper.
