# Provisionnement des environnements déployés

Scripts lancés **une fois avant le premier déploiement** d'un environnement, puis à chaque changement de mot de passe (US-005 B2a, #47). Ils s'exécutent dans les conteneurs PostgreSQL et RabbitMQ de la stack `trame-shared`, sur l'entrée standard. Leurs paramètres et leurs secrets passent par l'environnement (`-e NOM`, sans valeur), jamais en argument : un argument apparaît dans `ps`.

| Script                     | Crée                                                                                                      | Variables                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `postgres-environment.sql` | base `trame_<env>`, rôles `trame_<env>_migrator` (propriétaire, DDL) et `trame_<env>_api` (DML seulement) | `TRAME_ENVIRONMENT`, `TRAME_MIGRATOR_PASSWORD`, `TRAME_API_PASSWORD` |
| `postgres-keycloak.sql`    | base `keycloak` et rôle `keycloak`, partagés par les realms de staging et de production                   | `TRAME_KEYCLOAK_DATABASE_PASSWORD`                                   |
| `rabbitmq-environment.sh`  | vhost `trame-<env>`, utilisateurs `trame_<env>_relay` et `trame_<env>_worker`                             | `TRAME_ENVIRONMENT`, `TRAME_RELAY_PASSWORD`, `TRAME_WORKER_PASSWORD` |

`<env>` vaut `staging` ou `production`. L'invocation exacte figure en tête de chaque script ; le runbook (étape 4) donne l'ordre complet, avec la provenance des secrets.

## Comportement

- **Rejouable** : chaque script crée ce qui manque, puis réaligne mots de passe, attributs et droits. Relancé avec de nouveaux mots de passe, il les change sans toucher aux données ni aux files.
- **Rien n'est créé** si l'environnement est inconnu ou si un mot de passe manque.
- **Silencieux** quand tout réussit.

## Choix

- **Droits de l'API sans liste de schémas.** Les migrations créent elles-mêmes les schémas des contextes. Des privilèges par défaut du migrator donnent à l'API l'usage de chaque nouveau schéma et le DML sur ses tables, sans `TRUNCATE`. Le schéma `public`, où Prisma tient l'historique des migrations, reste fermé à l'API. Le script doit donc passer avant la première migration.
- **Connexion réservée.** PostgreSQL autorise par défaut tout rôle à se connecter à toute base. Chaque base retire ce droit à `PUBLIC` et ne l'accorde qu'à ses propres rôles.
- **Journal du serveur sans secret.** Avant toute requête qui contient un mot de passe, la session coupe chaque mode qui journalise le texte d'une requête : toutes les requêtes, celles qui durent, un échantillon de requêtes ou de transactions, celles en erreur, et les options de débogage qui journalisent l'arbre d'une requête. Elle le fait quel que soit le réglage du serveur. Un scénario le vérifie sur un serveur qui journalise tout.
- **Échecs de `rabbitmqctl` jamais masqués.** Chaque liste est capturée seule avant d'être filtrée. Dans un tube, l'échec de `rabbitmqctl` serait masqué par la commande suivante, et le script pourrait réussir en gardant un droit sur un autre vhost.
- **Mots de passe RabbitMQ sur l'entrée standard.** `rabbitmqctl add_user` et `change_password` ne la lisent que s'ils reçoivent exactement deux arguments : ces deux commandes s'appellent donc sans aucune option.
- **Mêmes permissions pour le relay et le worker** : `^trame\.diagnostic\.` en configuration, écriture et lecture, sans rôle de gestion. Chacun déclare toute la topologie de diagnostic, et RabbitMQ exige le droit de lecture sur une file créée avec une file de rebut. Comme le premier démarré crée les files, une lecture restreinte par rôle ferait échouer le démarrage selon l'ordre.

## Tests

`pnpm nx run infra:integration` joue les scénarios de #47 sur de vrais serveurs, aux images figées de `dev.yml`, en lançant les scripts comme sur le VPS (`postgres-provisioning.integration.spec.ts`, `rabbitmq-provisioning.integration.spec.ts`).
