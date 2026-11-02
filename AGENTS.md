# AGENTS.md — Trame

Règles communes à tous les agents (Claude, Codex) et aux humains. `CLAUDE.md` contient uniquement `@AGENTS.md`.
Chaque app peut avoir son propre `AGENTS.md`, qui précise ce fichier sans jamais le contredire.

## Le projet en bref

Trame planifie automatiquement les équipes d'un entrepôt logistique : besoins de couverture → planning optimisé (OR-Tools CP-SAT), conforme au Code du travail, expliqué, et modifiable avec évaluation instantanée par la PE (Procédure d'Évaluation).

À lire avant toute tâche :

- `docs/cadrage.md` : vision, règles métier, architecture ;
- `docs/adr/` : les décisions et leurs raisons. Ne jamais aller à l'encontre d'une ADR acceptée sans en proposer une nouvelle ;
- l'issue GitHub de la tâche : user story et critères d'acceptation.

## Structure du monorepo

```
apps/
  web/        Angular — manager, admin, PWA employé (v0.2)
  api/        NestJS — monolithe modulaire
  engine/     Python — FastAPI + worker AMQP, OR-Tools CP-SAT, PE
              src/trame_engine/contracts/ : modèles Pydantic GÉNÉRÉS, ne pas éditer
  docs/       Astro Starlight
libs/
  shared/contracts/              schémas zod (source unique des contrats, ADR-0018)
  platform/<module>/             socle générique de l'API, sans métier (ADR-0026)
  api/shared/database/           Prisma 7 : schéma, client, PrismaService
  web/ui/                        design system : composants génériques, tokens de marque à part
  web/<context>/data-access/     clients HTTP, état (signals, httpResource)
  web/<context>/feature-*/       pages et composants intelligents
  api/<context>/domain/          entités, value objects, règles — aucune dépendance framework
  api/<context>/application/     use cases, ports (interfaces)
  api/<context>/infrastructure/  adaptateurs : Prisma, AMQP, HTTP
infra/
  compose/    dev.yml, staging.yml, prod.yml (US-004, US-005)
  keycloak/   export du realm (versionné, US-020)
docs/
  adr/        une décision par fichier (format MADR)
  cadrage.md
  backlog-v0.1.md
```

Bounded contexts de l'API : `organization` (sites, postes, compétences, créneaux), `staff` (employés, contrats), `rules` (règles), `demand` (besoins), `scheduling` (planification) ; plus tard `swaps` (échanges), `forecasting` (prévision), `assistant`.

Le module `organization` est le **module de référence** : tout nouveau contexte reproduit sa structure, ses conventions et ses types de tests.

## Commandes

> Figées et vérifiées par US-002. Toujours lancer la vérification avant de déclarer une tâche terminée.

Prérequis : Node 26 (`.node-version`), pnpm 12, uv 0.13, Python 3.14 (installé par uv), Docker pour les tests d'intégration.

```bash
pnpm install                                       # installe aussi les hooks Git (lefthook)
pnpm nx run engine:install                         # environnement Python du moteur (uv sync)
pnpm nx serve api                                  # http://localhost:3000/api/v1 (DATABASE_URL requis)
pnpm nx serve web                                  # http://localhost:4200
pnpm nx serve engine                               # http://127.0.0.1:8000/health
pnpm nx serve docs

pnpm nx affected -t lint typecheck test --base=origin/main   # vérification avant PR (moteur compris)
pnpm nx run-many -t lint typecheck test            # tout le dépôt
pnpm nx run api-database:integration               # Postgres réel via Testcontainers (Docker requis)
pnpm nx run contracts:generate                     # régénère les modèles Pydantic depuis zod
pnpm nx run contracts:check                        # échoue si les modèles générés ne sont pas à jour
pnpm nx run api-database:prisma-generate           # client Prisma (lancé aussi avant typecheck, test et build)
pnpm nx run api-database:prisma-migrate --name <nom>   # nouvelle migration (base locale requise)
pnpm nx format:check                               # Prettier (TypeScript, JSON, Markdown, YAML)
pnpm knip                                          # code mort et dépendances inutilisées
```

La CI (`.github/workflows/ci.yml`) lance ces contrôles sur chaque PR ; seul le check « CI OK » est exigé pour fusionner, et il agrège tous les autres. CodeQL tourne à part (`codeql.yml`).

L'infrastructure locale (`docker compose -f infra/compose/dev.yml up -d` : Postgres, RabbitMQ, Keycloak) arrive avec US-004.

## Règles d'architecture (bloquantes)

1. `domain` n'importe rien de NestJS, Prisma, HTTP ni AMQP. Du TypeScript pur.
2. `application` dépend uniquement de `domain` et de ses propres ports.
3. Les contrôleurs, les gateways et l'agent IA sont des adaptateurs primaires : ils appellent des use cases, jamais un repository directement.
4. Un bounded context n'importe jamais l'intérieur d'un autre. Ils communiquent par use case public ou par événement.
5. **Aucune logique de contrainte de planning hors du moteur.** Chaque règle est une classe unique avec `add_to_model()` et `evaluate()`, livrée avec son test de cohérence (ADR-0020).
6. Le moteur est sans état : il ne lit ni n'écrit jamais la base.
7. Tout contrat (DTO, message, événement) est un schéma zod de `libs/shared/contracts`. Un changement incompatible crée une nouvelle version, jamais une modification sur place. Les modèles Pydantic du moteur sont générés, jamais écrits à la main (ADR-0018).
8. Un événement métier est publié via l'outbox, jamais directement sur RabbitMQ depuis un use case. Tout message reçu passe par l'inbox (ADR-0021).
9. Chaque agrégat porte un `organizationId`, et chaque requête filtre dessus. Chaque accès à un objet vérifie aussi sa propriété (un employé ne voit que ses données). Un schéma Postgres par contexte, sans jointure ni clé étrangère entre contextes (ADR-0022).
10. Le LLM ne produit jamais un planning. Toute écriture initiée par l'agent passe par un use case, par la PE et par une confirmation humaine (ADR-0014).
11. `libs/platform/*` n'importe que d'autres libs `platform`, et ne contient aucun terme de planification. Un code n'y entre que s'il sert déjà Trame (ADR-0026).

Les règles 1 à 4 et 11 sont vérifiées par `@nx/enforce-module-boundaries` côté TypeScript, et par import-linter côté Python.

## Conventions

- **TypeScript** : `strict`, pas de `any`, pas de `!` non justifié. Validation des entrées aux frontières avec les schémas zod partagés (`ZodValidationPipe` côté API).
- **Python** : typage complet (`mypy --strict`), Ruff, Pydantic.
- **Temps** (ADR-0019, ADR-0027) : jamais de date naïve. Instants en UTC, calculs dans le fuseau du site, avec Temporal. L'heure courante passe par le port `Clock` (`@trame/platform/clock`). `new Date()`, `Date.now()` et `Temporal.Now` sont interdits par la lint hors de l'adaptateur d'horloge.
- **API** (ADR-0021) : préfixe `/api/v1`, erreurs RFC 9457 (`application/problem+json`), pagination par curseur, `Idempotency-Key` sur les POST qui déclenchent un traitement.
- **Messages** : nommés `<contexte>.<événement>.v<N>`.
- **Contrats** (ADR-0018) : uniquement des constructions zod exportables en JSON Schema. Pas de `transform` ni de validation personnalisée dans un schéma échangé, et des dates en chaînes ISO 8601, jamais `z.date()`.
- **Migrations** (ADR-0022) : expand/contract. Une migration ne casse jamais la version précédente de l'API. Supprimer ou renommer une colonne se fait en deux releases.
- **Résolutions** (ADR-0020) : tout code qui consomme un résultat du moteur traite les cinq issues (`OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, `UNKNOWN`, `CANCELLED`), y compris l'absence de solution.
- **Logs** : JSON structurés (`nestjs-pino`, `structlog`), avec l'identifiant de trace. Jamais de donnée personnelle en clair.
- **Configuration** : validée au démarrage par un schéma (zod côté API, `pydantic-settings` côté moteur). Une variable manquante bloque le lancement.
- **Nommage** : le code est en anglais. Les termes métier gardent leur sens (`Shift`, `Coverage`, `Skill`, `Contract`, `EvaluationResult` avec `FEASIBLE` / `INFEASIBLE` / `UNCERTAIN`, affichés RÉALISABLE / IRRÉALISABLE / INCERTAIN). L'UI, la doc et les messages d'erreur utilisateur sont en français. Exception : les identifiants de règles sont des termes métier affichés, donc en français et en majuscules (`REPOS_QUOTIDIEN_MIN`).
- **Commits** : Conventional Commits avec un scope, description en français. Exemple : `feat(scheduling): lancer une résolution asynchrone`. Vérifiés par commitlint.
- **Branches** : `feat/US-061-modele-cpsat`, `fix/US-072-...`, `chore/...`.
- **PR** : une PR = une user story (ou une étape annoncée d'une story). Squash merge. Le template de PR est obligatoire.
- **Dépendances** : toute nouvelle dépendance est justifiée dans la description de la PR (pourquoi celle-ci, quelles alternatives).

## Tests

- Les tests sont écrits avant ou avec le code. Les critères Gherkin de l'issue deviennent des tests d'acceptation.
- **Unitaires** : Vitest pour le domaine, les use cases (avec repository en mémoire) et les composants Angular. pytest pour le modèle et la PE.
- **Cohérence des règles** (Hypothesis) : test bidirectionnel solveur ↔ PE pour chaque règle (ADR-0020).
- **Temps** : chaque règle de durée a un test sur une nuit de changement d'heure.
- **Intégration** : Testcontainers avec un vrai Postgres et un vrai RabbitMQ. Ne pas mocker la base dans les tests d'intégration.
- **Contrats** : un test exporte tous les schémas en JSON Schema, et des messages valides et invalides sont testés des deux côtés de l'échange API ↔ moteur.
- **Autorisation** : chaque endpoint a un test d'accès croisé (autre organisation, autre employé), qui doit renvoyer 404.
- **E2E** : Playwright sur Chromium, Firefox et WebKit, avec vérification d'accessibilité (axe), sur les parcours critiques (générer, modifier, publier).
- **Couverture** : ≥ 90 % sur le domaine, ≥ 80 % au global, imposés par la quality gate SonarCloud. Tests de mutation (Stryker) sur le domaine. Ne jamais baisser un seuil pour faire passer une PR.

## Déroulé d'une tâche (agent)

1. Vérifier la **Definition of Ready** de l'issue. Si elle n'est pas remplie, le signaler au lieu de commencer.
2. Lire l'issue, `docs/cadrage.md`, les ADR et le code voisin. Imiter le module de référence.
3. **Proposer un plan** (fichiers touchés, approche, tests) et attendre la validation avant d'implémenter.
4. Implémenter par petits commits.
5. Lancer `pnpm nx affected -t lint typecheck test --base=origin/main` (moteur compris), et `pnpm nx run api-database:integration` si la persistance est touchée. Si un contrat a changé, lancer `pnpm nx run contracts:generate` et commiter le résultat. Tout doit être vert.
6. Mettre à jour la doc concernée. Si une décision a été prise, rédiger une ADR au statut « Proposé ».
7. Ouvrir la PR avec le template rempli. Signaler explicitement tout doute ou écart par rapport au plan.

## Ne jamais

- Commiter un secret, un `.env` ou un token. Utiliser `.env.example`.
- Désactiver, sauter ou affaiblir un test, une règle de lint ou une règle de frontière pour faire passer la CI.
- Modifier une migration déjà mergée. On crée une nouvelle migration.
- Supprimer ou renommer une colonne encore lue par la version précédente de l'API dans la même release.
- Pousser sur `main`, ou faire un `git push --force` sur une branche partagée.
- Inventer une règle légale ou une valeur réglementaire. Les valeurs viennent de `docs/cadrage.md` §6 et restent paramétrables.
- Utiliser une date naïve, ou lire l'heure courante (`new Date()`, `Date.now()`, `Temporal.Now`) hors de l'adaptateur d'horloge.
- Éditer à la main un modèle Pydantic généré.
- Ajouter des en-têtes de sécurité dans l'API : ils sont posés par Traefik et par la CSP du front (ADR-0024).
- Envoyer des données nominatives à un LLM. On pseudonymise (des ID, jamais de noms).
- Élargir le périmètre d'une tâche sans le signaler.

## Definition of Ready

Une story ne démarre que si :

- [ ] la user story et sa valeur sont claires ;
- [ ] les critères d'acceptation sont écrits en Gherkin ;
- [ ] la maquette est validée, si la story touche l'interface ;
- [ ] les contrats (schémas zod) concernés sont identifiés ;
- [ ] les dépendances sont terminées, ou simulables ;
- [ ] elle tient dans une PR lisible, sinon elle est découpée.

## Definition of Done

- [ ] Critères d'acceptation de l'issue couverts par des tests qui passent
- [ ] Lint, typecheck et tests verts (CI)
- [ ] Aucune violation des frontières d'architecture
- [ ] Modèles Pydantic régénérés si un contrat a changé
- [ ] Test d'accès croisé pour chaque nouvel endpoint
- [ ] Doc à jour (et ADR si une décision a été prise)
- [ ] Migrations compatibles avec la version précédente de l'API (expand/contract)
- [ ] Revue croisée faite (l'agent qui écrit n'est pas celui qui relit), puis revue humaine
- [ ] Déployé sur staging et vérifié
