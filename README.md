# Trame

Planification d'équipes sous contraintes pour les entrepôts logistiques : besoins de couverture, planning optimisé par OR-Tools CP-SAT, conforme au Code du travail, expliqué, et modifiable avec évaluation instantanée par la PE (Procédure d'Évaluation).

> Projet en construction : le socle technique est en place (US-002). Le README complet, la démo et la vidéo arrivent avec US-091.

## Architecture

- `apps/web` : Angular 22, zoneless, Tailwind 4.
- `apps/api` : NestJS 12 en monolithe modulaire hexagonal, Prisma 7, PostgreSQL.
- `apps/engine` : Python 3.14, FastAPI, OR-Tools CP-SAT. Sans état.
- `apps/docs` : Astro Starlight.
- `libs/shared/contracts` : contrats zod 4, d'où sont générés les modèles Pydantic du moteur.
- `libs/platform/*` : socle générique de l'API (horloge, erreurs RFC 9457, configuration, logs, santé).

Le cadrage est dans [`docs/cadrage.md`](docs/cadrage.md), les décisions dans [`docs/adr/`](docs/adr/README.md), les règles de contribution dans [`AGENTS.md`](AGENTS.md).

## Démarrer

Prérequis : Node 26, pnpm 12, uv 0.13 ; Docker pour les tests d'intégration.

```bash
pnpm install
pnpm nx run engine:install
pnpm nx run-many -t lint typecheck test
pnpm nx serve web
```

## Licence

[MIT](LICENSE)
