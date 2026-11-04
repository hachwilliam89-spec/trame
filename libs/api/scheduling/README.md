# Scheduling — diagnostic asynchrone (US-009 A1/A2)

Ce diagnostic vérifie la chaîne de traitement d'un calcul fictif. Elle ne crée pas de
planning et n'évalue aucune règle légale. Le transport et le worker sont lancés séparément (voir ci-dessous).
En leur absence, le traitement reste `QUEUED`. La progression SSE appartient à A3.

## Routes

| Route                                        | Rôles          | Comportement                                                       |
| -------------------------------------------- | -------------- | ------------------------------------------------------------------ |
| `POST /api/v1/diagnostics/solver-runs`       | admin, manager | Corps `{}`, `Idempotency-Key` obligatoire ; 202, DTO et `Location` |
| `GET /api/v1/diagnostics/solver-runs/:runId` | admin, manager | État de la demande ; 404 si absente, mal formée ou étrangère       |

Exemple après authentification locale par le parcours PKCE documenté dans `infra/README.md` :

```bash
curl --request POST http://127.0.0.1:3000/api/v1/diagnostics/solver-runs \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --header 'Idempotency-Key: diagnostic-local-1' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

Réponse : `{ "id": "…", "status": "QUEUED", "createdAt": "…Z" }`.
L'organisation vient du jeton, jamais du corps ; les paramètres supplémentaires sont refusés.
Les deux routes refusent les anonymes (401) et les employés (403), en problem+json.

Une même clé retrouve le même job dans la même organisation, y compris après reconnexion.
La clé n'expire pas dans A1 ; une nouvelle clé demande un autre diagnostic. Elle ne doit
contenir aucune donnée personnelle. La purge sera conçue avec sa fenêtre de rejeu explicite.
Les quatre états techniques prévus sont `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED` ;
ils ne remplacent pas les issues CP-SAT du futur résultat.

## Structure et persistance

- `domain` : types du diagnostic et du problème fictif fixe `assignment-smoke-v1`.
- `application` : demande et consultation, port `DiagnosticRuns`, dépôt en mémoire exporté
  uniquement par `@trame/api/scheduling/application/testing`.
- `infrastructure` : routes NestJS et adaptateur Prisma.

La transaction insère le job par `INSERT ... ON CONFLICT (organization_id, idempotency_key)
DO NOTHING RETURNING id`, puis son message uniquement en cas de création. Une deuxième
instruction relit le gagnant avec l'isolation `ReadCommitted`. Aucun autre conflit d'unicité
n'est avalé. Si l'insertion du message échoue, la création du job est annulée.
Voir [PostgreSQL 18, INSERT](https://www.postgresql.org/docs/18/sql-insert.html).

Le schéma `scheduling` contient `diagnostic_runs` et `outbox_messages`, sans clé étrangère
vers un autre contexte. La migration ajoute seulement ces tables et leurs contraintes.
L'enveloppe `scheduling.diagnostic-requested.v1` contient organisation, identifiant,
instant ISO 8601 avec fuseau (produit en UTC) et `{runId, problem: 'assignment-smoke-v1'}`. Elle est validée par zod,
exportée en JSON Schema et générée en Pydantic ; les fixtures sont partagées.

## Vérifications

```bash
pnpm nx run api-scheduling-application:test
pnpm nx run api-scheduling-infrastructure:test
pnpm nx run api-scheduling-infrastructure:integration  # Docker requis
```

PostgreSQL réel couvre concurrence, isolation, relecture après reconnexion et rollback.
Les tests HTTP couvrent chaque route, chaque rôle, les entrées et les accès croisés.
Le test du module sur PostgreSQL vérifie l'assemblage réel des adaptateurs. Les intégrations A2 lancent aussi RabbitMQ et un vrai worker Python ; la preuve déployée reste suivie par l'issue #29.

## Exécuter le diagnostic

Après `infra:up`, migrations et lancement de l'API, lancer les deux processus décrits dans
[tools/diagnostic-transport](../../../tools/diagnostic-transport/README.md).
Le même POST renvoie 202. Le GET finit par exposer `outcome` et `finishedAt`, ou `failure`.
`SUCCEEDED` signifie que le résultat du moteur est conservé ; l'issue CP-SAT dans
`outcome.result.status` dit si une solution existe. Les issues sans solution restent explicites.
`outcome` conserve la matrice fictive, la graine 0, un worker, la limite de 5 s et la solution.
`MODEL_INVALID` est un échec technique, pas une absence de solution.

Les rapports `scheduling.diagnostic-reported.v1` portent l'identifiant de la demande initiale.
L'adaptateur le compare à l'outbox et à l'organisation, puis verrouille le job. Reçu inbox,
état et événement ordonné sont écrits ensemble. Un terminal déjà enregistré n'est plus
remplacé, même après recalcul ; un STARTED tardif ne le rouvre pas.

Les événements de progression sont conservés pour A3 ; leur diffusion SSE, leur reprise et
leur purge une heure après fin arrivent avec A3. A2 ne prétend pas livrer cette interface.
Le moteur n'a ni URL PostgreSQL dans ses paramètres ni adaptateur de stockage.

Les tests d'intégration supplémentaires couvrent le processus Node réel, le worker Python,
le broker redémarré, une base arrêtée 15 s, la redélivrance et le recalcul, les publications
non routées, les reprises retardées/épuisées et le parking. Les deux routes gardent les
mêmes refus et les mêmes filtres d'organisation.
