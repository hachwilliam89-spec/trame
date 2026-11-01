# ADR-0008 — Prisma comme ORM

- **Statut** : Accepté
- **Contexte** : il faut des migrations fiables, un typage fort, et un outil demandé sur le marché.
- **Décision** : Prisma, cantonné à la couche `infrastructure` (adaptateurs de repository). Les migrations sont versionnées et ne sont jamais modifiées après merge.
- **Conséquences** :
  - (+) Bonne expérience de dev, schéma lisible.
  - (−) Mapping explicite vers les entités du domaine.
- **Alternatives écartées** : TypeORM (fiabilité) ; MikroORM (moins demandé) ; Drizzle (alternative viable, moins répandue avec NestJS).
