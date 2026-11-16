# Scheduling — diagnostic asynchrone (US-009 A1/A2/A3)

Ce diagnostic vérifie la chaîne de traitement d'un calcul fictif. Elle ne crée pas de
planning et n'évalue aucune règle légale. Le transport et le worker sont lancés séparément (voir ci-dessous).
En leur absence, le traitement reste `QUEUED`. La progression SSE et la reprise sont disponibles (voir ci-dessous).

## Routes

| Route                                               | Rôles          | Comportement                                                       |
| --------------------------------------------------- | -------------- | ------------------------------------------------------------------ |
| `POST /api/v1/diagnostics/solver-runs`              | admin, manager | Corps `{}`, `Idempotency-Key` obligatoire ; 202, DTO et `Location` |
| `GET /api/v1/diagnostics/solver-runs/:runId`        | admin, manager | État de la demande ; 404 si absente, mal formée ou étrangère       |
| `GET /api/v1/diagnostics/solver-runs/:runId/events` | admin, manager | Progression SSE, reprise par `Last-Event-ID` ; détails ci-dessous  |

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
Les trois routes refusent les anonymes (401) et les employés (403), en problem+json.

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

## Génération du planning d'une semaine (US-061, PR 6a)

La PR 6a livre le cœur du lancement, sans route : le lancement par HTTP arrive avec la PR 6b,
quand le relais sait router la demande et recevoir son résultat.

- `domain` : `ScheduleGeneration`, et `composeSchedulingProblem`, qui fige le problème envoyé
  au moteur (`SchedulingProblemV1`) :
  - un shift par jour, créneau type et poste ayant un besoin, d'identifiant
    `date/créneau type/poste`, avec ses instants dans le fuseau du site ;
  - les salariés du site dont un contrat couvre toute la semaine ; les autres sont écartés
    avec le motif `NO_CONTRACT_COVERING_WEEK`, que l'écran expliquera ;
  - les six règles du jalon 1 aux valeurs du cadrage §6 (11 h, 10 h, 48 h), fixes à ce jalon ;
  - un worker, la graine 0 et 30 s (ADR-0037).
- `application` :
  - `StartScheduleGeneration` : 400 si la semaine ne commence pas un lundi, 404 pour un site
    d'une autre organisation, 422 sans besoin. La même clé rend la génération d'origine, même
    si les besoins ont changé ; la même clé pour un autre site ou une autre semaine est refusée
    (409) ;
  - `GetScheduleGeneration` et `GetWeekScheduleGenerations`, qui rend le dernier essai et le
    dernier planning exploitable (`OPTIMAL` ou `FEASIBLE`), affiché pendant un nouveau calcul.
- `infrastructure` : `ScheduleGenerationModule.forRoot({ weekPlanning })` et
  `PrismaScheduleGenerations`. Le port `WeekPlanningSource` est fourni par `apps/api`
  (`SchedulingWeekPlanningModule`), avec les use cases publics d'`organization`, `demand` et
  `staff`.

La table `schedule_generations` garde l'instantané, les paramètres et le résultat : un besoin
modifié après le calcul ne change pas la couverture affichée d'un ancien planning. Les noms des
salariés restent dans `staff` : aucune donnée nominative n'est copiée dans `scheduling`.

Le relais ne prend dans l'outbox que les types qu'il sait router, filtrés dans la sélection
SQL avant `LIMIT 1` : une demande de génération en attente ne bloque jamais les diagnostics,
même après un retour à une version antérieure.

## Chaîne de traitement d'une génération (PR 6b)

- `ScheduleTransport`, lancé par le relais à côté du diagnostic : il publie les demandes de
  génération de l'outbox, reçoit les rapports par l'inbox et traite la file de rebut.
- `advanceGeneration` : `STARTED` donne `RUNNING`, `RESULT` donne `SUCCEEDED` avec le résultat,
  `FAILED` donne `FAILED` ; un rapport tardif ne rouvre rien. Les cinq issues sont traitées.
- Avant d'enregistrer un planning, le domaine le contrôle contre l'instantané : chaque couple
  shift-salarié une seule fois, des shifts et des salariés du problème, pas plus de personnes que
  le besoin, et des manques annoncés égaux à ceux que donnent les affectations. C'est un contrôle
  de cohérence ; les règles de planning restent dans le moteur (règle 5).
- Un rapport refusé (illisible, sans demande, incohérent) part en rebut. Rattaché à sa demande
  publiée, il fait passer la génération en `FAILED` (`PROCESSING_FAILED`) ; une demande épuisée
  donne `RETRIES_EXHAUSTED`. Une génération terminée n'est jamais rouverte.
- Une demande dont le message publié dépasserait 1 Mio (`SCHEDULE_MESSAGE_MAX_BYTES`) est refusée
  avant toute écriture (`ScheduleRequestTooLargeError`, 422 en 6c).
- Une file pleine ne suspend que son flux, 5 s : le diagnostic continue pendant une saturation
  de la génération, et inversement (ADR-0032, ajout du 17 novembre).

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
[apps/relay](../../../apps/relay/README.md).
Le même POST renvoie 202. Le GET finit par exposer `outcome` et `finishedAt`, ou `failure`.
`SUCCEEDED` signifie que le résultat du moteur est conservé ; l'issue CP-SAT dans
`outcome.result.status` dit si une solution existe. Les issues sans solution restent explicites.
`outcome` conserve la matrice fictive, la graine 0, un worker, la limite de 5 s et la solution.
`MODEL_INVALID` est un échec technique, pas une absence de solution.

Les rapports `scheduling.diagnostic-reported.v1` portent l'identifiant de la demande initiale.
L'adaptateur le compare à l'outbox et à l'organisation, puis verrouille le job. Reçu inbox,
état et événement ordonné sont écrits ensemble. Un terminal déjà enregistré n'est plus
remplacé, même après recalcul ; un STARTED tardif ne le rouvre pas.

La route `GET /api/v1/diagnostics/solver-runs/:runId/events` diffuse les événements en SSE.
Elle utilise le même Bearer dans `Authorization` et reprend après `Last-Event-ID`.
La conservation est d'une heure après fin du diagnostic ; le résultat et l'idempotence restent disponibles.
Voir le [contrat du flux et ses erreurs](infrastructure/README.md) pour les détails.
Le moteur n'a ni URL PostgreSQL dans ses paramètres ni adaptateur de stockage.

Les tests d'intégration supplémentaires couvrent le processus Node réel, le worker Python,
le broker redémarré, une base arrêtée 15 s, la redélivrance et le recalcul, les publications
non routées, les reprises retardées/épuisées et le parking. Les deux routes gardent les
mêmes refus et les mêmes filtres d'organisation.
