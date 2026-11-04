# Trame

Planification d'équipes sous contraintes pour les entrepôts logistiques : besoins de couverture, planning optimisé par OR-Tools CP-SAT, conforme au Code du travail, expliqué, et modifiable avec évaluation instantanée par la PE (Procédure d'Évaluation).

> Projet en construction. En place : le socle technique (US-002), la CI et la sécurité de la chaîne de livraison (US-003), et côté API le module de référence `organization` : sites, créneaux types, compétences et postes (US-030, PR A et B ; la page Angular suit avec la PR C). Le README complet, la démo et la vidéo arrivent avec US-091.

## Architecture

- `apps/web` : Angular 22, zoneless, Tailwind 4. Squelette pour l'instant ; les écrans arrivent après les maquettes (US-012).
- `apps/api` : NestJS 12 en monolithe modulaire hexagonal, Prisma 7, PostgreSQL.
- `apps/engine` : Python 3.14, FastAPI, OR-Tools CP-SAT. Sans état.
- `apps/docs` : Astro Starlight.
- `libs/api/<contexte>/{domain,application,infrastructure}` : un contexte métier en trois couches. `organization` est le module de référence, que les autres contextes reproduisent.
- `libs/api/shared/database` : Prisma 7, un schéma PostgreSQL par contexte, migrations vérifiées en CI.
- `libs/shared/contracts` : contrats zod 4, d'où sont générés les modèles Pydantic du moteur.
- `libs/platform/*` : socle générique de l'API (horloge, identifiants, pagination, authentification, erreurs RFC 9457, validation, configuration, logs, santé).
- `tools/dependency-graph` : soumission des dépendances au graphe de GitHub (ADR-0029).

Le cadrage est dans [`docs/cadrage.md`](docs/cadrage.md), les décisions dans [`docs/adr/`](docs/adr/README.md), les règles de contribution dans [`AGENTS.md`](AGENTS.md).

## Qualité et sécurité

- Chaque PR passe la CI : lint (frontières d'architecture et lisibilité), typecheck, tests, build, intégration sur un vrai PostgreSQL, migrations Prisma sans écart, contrats générés à jour, Knip, audit des workflows par zizmor.
- CodeQL bloque toute nouvelle alerte haute ou critique, et gitleaks tout secret commité. L'audit des dépendances bloque les vulnérabilités hautes et critiques côté Node (`pnpm audit --audit-level high`), et toute vulnérabilité connue côté moteur (`pip-audit`) ; les alertes moyennes et faibles sont suivies dans Dependabot. Renovate tient les dépendances à jour, et le graphe de dépendances de GitHub voit tous les paquets, pnpm comme uv.
- Les règles de développement (architecture, lisibilité, tests, Definition of Done) sont dans [`AGENTS.md`](AGENTS.md).

## Démarrer

Prérequis : Docker avec Compose v2, Node 26 et pnpm 12. Le moteur demande aussi uv 0.13.

```bash
cp .env.example .env
pnpm install
pnpm nx run infra:up     # PostgreSQL, RabbitMQ et Keycloak sur 127.0.0.1, puis migrations
pnpm nx serve api        # http://127.0.0.1:3000/api/v1/health/ready
```

- La stack et l'API n'écoutent que sur `127.0.0.1` : rien n'est joignable depuis le réseau.
- Interface de management de RabbitMQ : http://127.0.0.1:15672, avec le compte de `.env`.
- `pnpm nx run infra:down` arrête la stack et garde les données. `pnpm nx run infra:reset` supprime aussi les volumes : relancer ensuite `infra:up`, qui réapplique les migrations.
- Keycloak et comptes locaux : [`infra/keycloak/README.md`](infra/keycloak/README.md). Ses données et sessions sont réinitialisées à la recréation du conteneur.
- Détails dans [`infra/README.md`](infra/README.md).

Vérifications :

```bash
pnpm nx run engine:install
pnpm exec playwright install chromium
pnpm nx run-many -t lint typecheck test
pnpm nx run-many -t integration   # PostgreSQL, RabbitMQ, Keycloak et Chromium ; Docker requis
```

## Licence

[MIT](LICENSE)
