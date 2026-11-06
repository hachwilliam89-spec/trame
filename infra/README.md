# `infra`

Infrastructure du projet : stack de développement local PostgreSQL, RabbitMQ et Keycloak (US-004, US-020 A). Les fichiers de staging et de prod arrivent avec US-005.

US-005 A ajoute les [images applicatives et leur preuve conteneurisée](docker/README.md) : `pnpm nx run infra:images-test`. La stack de preuve est isolée de la stack de développement ; ce n'est pas encore un déploiement sur le VPS.

US-005 B2a prépare le staging : [realm Keycloak généré](keycloak/README.md), [provisionnement de PostgreSQL et de RabbitMQ](provisioning/README.md) par environnement, et les stacks Compose déployées : `compose/shared.yml` (PostgreSQL, RabbitMQ, Keycloak préparé par `docker/keycloak.Dockerfile`) et `compose/staging.yml` (les six images, par digest). Leurs secrets suivent les modèles de `compose/secrets.example/`.

## Commandes

Toutes lisent le `.env` à la racine, copié depuis `.env.example`.

| Commande                  | Effet                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm nx run infra:up`    | Démarre PostgreSQL, RabbitMQ et Keycloak, attend qu'ils soient sains (2 minutes au plus), applique les migrations |
| `pnpm nx run infra:down`  | Arrête la stack et supprime ses conteneurs. Les volumes, donc les données, sont conservés                         |
| `pnpm nx run infra:reset` | Supprime aussi les volumes : les données sont perdues. Relancer ensuite `infra:up`                                |

## Services

| Service    | Adresse sur le poste    | Compte                                                                 |
| ---------- | ----------------------- | ---------------------------------------------------------------------- |
| PostgreSQL | `127.0.0.1:5432`        | `POSTGRES_USER` / `POSTGRES_PASSWORD`, base `POSTGRES_DB`              |
| RabbitMQ   | `127.0.0.1:5672` (AMQP) | `RABBITMQ_USER` / `RABBITMQ_PASSWORD`                                  |
| Management | http://127.0.0.1:15672  | le même compte que RabbitMQ                                            |
| Keycloak   | http://127.0.0.1:8080   | comptes et configuration dans [keycloak/README.md](keycloak/README.md) |

Les ports se changent dans `.env` (`POSTGRES_PORT`, `RABBITMQ_PORT`, `RABBITMQ_MANAGEMENT_PORT`, `KEYCLOAK_PORT`). Adapter `DATABASE_URL` pour PostgreSQL, `OIDC_ISSUER_URL` et `OIDC_JWKS_URL` pour Keycloak. Les modifications du realm Keycloak sont perdues à la recréation de son conteneur ; ses données n'ont pas de volume persistant en dev.

## Choix

- **Ports sur `127.0.0.1`.** Sans adresse, Docker publie un port sur toutes les interfaces du poste, et la base deviendrait joignable depuis le réseau local.
- **Images figées par version et digest.** Le tag seul peut être republié. Renovate suit les deux, grâce au motif `infra/compose/*.yml` déclaré dans `renovate.json` : son motif par défaut ne reconnaît que les fichiers nommés `compose*.yml`.
- **Healthchecks.** `--wait` n'attend un service que s'il en a un. Celui de PostgreSQL passe par TCP, car pendant l'initialisation le serveur temporaire n'écoute que sur son socket local.
- **Nom d'hôte fixe pour RabbitMQ.** Ses données sont rangées sous le nom du nœud, dérivé du nom d'hôte. Sans nom fixe, chaque nouveau conteneur repartirait d'un nœud vide.

## Tests

- `pnpm nx test infra` contrôle la configuration résolue par `docker compose config` avec `.env.example` : ports, healthchecks, images, volumes, comptes. La CLI Docker suffit.
- `pnpm nx run infra:integration` démarre réellement la stack, sous le projet Compose `trame-dev-integration` et sur des ports libres, sans toucher à la stack du développeur. Il couvre les scénarios de l'issue #13. Le démon Docker est requis.
- Le même contrôle lance les scénarios de l'issue #21 : Chromium se connecte à Keycloak en code + PKCE, puis les vrais jetons appellent l'API construite. Sur un poste, installer le navigateur par `pnpm exec playwright install chromium`.
- En CI, les navigateurs ne sont pas installés : ils tournent dans l'image officielle de Playwright, épinglée par digest, sur le réseau de l'hôte (`.github/actions/playwright-server`). Les tests s'y connectent quand `PLAYWRIGHT_SERVER` est défini (`src/lib/test-browser.ts`). L'image reste à la version de `playwright` de `package.json`, ce que vérifie `src/ci-playwright-image.spec.ts`.

## Diagnostic asynchrone

US-009 A2 utilise le RabbitMQ existant, sans nouveau conteneur ni port. Après mise à jour
d'un ancien `.env`, ajouter `AMQP_URL` depuis `.env.example` et adapter son port si
`RABBITMQ_PORT` a changé. Lancer ensuite `relay:serve` et `engine:worker`
(voir [leur procédure](../apps/relay/README.md)).

`rabbitmq/diagnostic-topology.json` est commun à Node et Python, validé par les contrats.
Les noms des quatre files et leur politique sont détaillés dans l'ADR-0032. Le parking
n'est pas consommé automatiquement : il conserve les messages isolés pour examen manuel.
La DLQ attend la finalisation persistée d'un échec avant de l'y envoyer ; une indisponibilité
de la base ne provoque pas une perte silencieuse dans ce parking.

Le parcours Keycloak teste aussi US-009 A3 : l'API construite reçoit un vrai jeton manager,
le relais Node et le worker Python traitent le diagnostic via RabbitMQ, puis le client
coupe le SSE après STARTED et reprend par Last-Event-ID jusqu'au résultat. Installer
l'environnement moteur avec `pnpm nx run engine:install` avant `infra:integration`.

Le premier front construit est aussi testé dans Chromium, Firefox et WebKit, avec axe.
Installer les navigateurs via `pnpm exec playwright install chromium firefox webkit`.
La fixture utilise une origine et un callback exacts propres à sa stack isolée (pas de wildcard).
Elle vérifie connexion, vrai calcul, rechargement, interruption/reprise, expiration puis
reconnexion, refus employé et référence de job étrangère. L'expiration navigateur est
avancée par l'horloge Playwright ; le back conserve ses propres tests d'expiration JWT/SSE.
