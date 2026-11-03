# `infra`

Infrastructure du projet. Pour l'instant, la stack de développement local (US-004) : les services dont l'API dépend, sur le poste uniquement. Keycloak la rejoint avec US-020, les fichiers de staging et de prod avec US-005.

## Commandes

Toutes lisent le `.env` à la racine, copié depuis `.env.example`.

| Commande                  | Effet                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm nx run infra:up`    | Démarre PostgreSQL et RabbitMQ, attend qu'ils soient sains (2 minutes au plus), applique les migrations |
| `pnpm nx run infra:down`  | Arrête la stack et supprime ses conteneurs. Les volumes, donc les données, sont conservés               |
| `pnpm nx run infra:reset` | Supprime aussi les volumes : les données sont perdues. Relancer ensuite `infra:up`                      |

## Services

| Service    | Adresse sur le poste    | Compte                                                    |
| ---------- | ----------------------- | --------------------------------------------------------- |
| PostgreSQL | `127.0.0.1:5432`        | `POSTGRES_USER` / `POSTGRES_PASSWORD`, base `POSTGRES_DB` |
| RabbitMQ   | `127.0.0.1:5672` (AMQP) | `RABBITMQ_USER` / `RABBITMQ_PASSWORD`                     |
| Management | http://127.0.0.1:15672  | le même compte que RabbitMQ                               |

Les ports se changent dans `.env` (`POSTGRES_PORT`, `RABBITMQ_PORT`, `RABBITMQ_MANAGEMENT_PORT`). `DATABASE_URL` doit alors suivre.

## Choix

- **Ports sur `127.0.0.1`.** Sans adresse, Docker publie un port sur toutes les interfaces du poste, et la base deviendrait joignable depuis le réseau local.
- **Images figées par version et digest.** Le tag seul peut être republié. Renovate suit les deux, grâce au motif `infra/compose/*.yml` déclaré dans `renovate.json` : son motif par défaut ne reconnaît que les fichiers nommés `compose*.yml`.
- **Healthchecks.** `--wait` n'attend un service que s'il en a un. Celui de PostgreSQL passe par TCP, car pendant l'initialisation le serveur temporaire n'écoute que sur son socket local.
- **Nom d'hôte fixe pour RabbitMQ.** Ses données sont rangées sous le nom du nœud, dérivé du nom d'hôte. Sans nom fixe, chaque nouveau conteneur repartirait d'un nœud vide.

## Tests

- `pnpm nx test infra` contrôle la configuration résolue par `docker compose config` avec `.env.example` : ports, healthchecks, images, volumes, comptes. La CLI Docker suffit.
- `pnpm nx run infra:integration` démarre réellement la stack, sous le projet Compose `trame-dev-integration` et sur des ports libres, sans toucher à la stack du développeur. Il couvre les scénarios de l'issue #13. Le démon Docker est requis.
