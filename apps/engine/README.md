# Moteur d'optimisation (`apps/engine`)

Service Python sans état (ADR-0004) : il reçoit un problème complet, le résout avec OR-Tools CP-SAT et renvoie une solution et son explication. Il ne lit ni n'écrit jamais la base.

## Structure

```
src/trame_engine/
  api/        adaptateur HTTP (FastAPI)
  solver/     modèles CP-SAT et PE, sans dépendance HTTP ni configuration
  contracts/  modèles Pydantic GÉNÉRÉS depuis libs/shared/contracts : ne pas éditer
  settings.py configuration validée au démarrage (variables ENGINE_*)
  logs.py     logs structurés (structlog), Uvicorn compris
```

Les couches sont vérifiées par import-linter : `api` → `solver` → `contracts`.

## Planification d'une semaine (jalon 1)

`solver/scheduling/` résout le planning d'une semaine reçu au format `SchedulingProblemV1` (issue #69) :

- `read_week` lit le contrat et refuse un problème incohérent (`InvalidProblemError`) : identifiants en double, shift qui finit avant de commencer, minimum de contrat supérieur au maximum, règle en double.
- Une variable par couple (salarié, shift), et jamais plus de personnes qu'un shift n'en demande. Les six règles du jalon 1 sont des contraintes dures ; la couverture est l'objectif (mode standard, cadrage §8) : maximiser les affectations, c'est minimiser les places non pourvues.
- Chaque règle est une classe de `rules/` avec `add_to_model()` et `evaluate()` (ADR-0020). `evaluate_schedule` (PE) juge un planning donné : règles enfreintes, et manques chiffrés par shift.
- Le repos se mesure en temps écoulé entre deux instants ; la durée quotidienne se compte par jour civil local du début du shift, convention à revoir avant les créneaux de nuit.
- `tests/scheduling/test_coherence.py` vérifie, pour chaque règle et pour les six ensemble, sur des semaines tirées au hasard (Hypothesis), que toute solution du solveur est conforme pour la PE, et que le modèle accepte un planning si et seulement si la PE le juge conforme.

## Commandes

```bash
pnpm nx run engine:install     # uv sync --frozen
pnpm nx serve engine           # http://127.0.0.1:8000/health
pnpm nx test engine
pnpm nx run engine:integration # worker contre un vrai RabbitMQ (Docker requis, environ 2 min)
pnpm nx lint engine            # ruff check, ruff format --check, lint-imports
pnpm nx typecheck engine       # mypy --strict
pnpm nx run contracts:generate # régénère src/trame_engine/contracts
```

## Configuration

| Variable | Défaut | Rôle |
|---|---|---|
| `ENGINE_HOST` | `127.0.0.1` | Adresse d'écoute |
| `ENGINE_PORT` | `8000` | Port HTTP |
| `ENGINE_LOG_LEVEL` | `info` | `critical`, `error`, `warning`, `info`, `debug` |
| `ENGINE_LOG_JSON` | `true` | Logs JSON (`false` : sortie lisible en local) |
| `ENGINE_MAX_WORKERS` | `4` | Plafond de workers CP-SAT (1 à 8) |

## Worker : diagnostics et générations (US-009 A2, US-061)

`pnpm nx run engine:worker` démarre un consommateur AMQP indépendant du serveur FastAPI.
Il exige `AMQP_URL`, utilise les topologies communes versionnées dans `infra/rabbitmq`,
et ne lit ni n'écrit PostgreSQL. `DIAGNOSTIC_TOPOLOGY_FILE` et `SCHEDULE_TOPOLOGY_FILE`,
facultatifs, doivent être des chemins absolus si les fichiers par défaut sont remplacés.
Le diagnostic utilise un worker CP-SAT, une graine de 0 et une limite de 5 s. Une génération
utilise les paramètres de sa demande, le nombre de workers étant plafonné par
`ENGINE_MAX_WORKERS` (cadrage §12 : 4 en prod, 1 en staging).

Le worker traite **une demande à la fois**, diagnostic ou génération, dans l'ordre d'arrivée
(`worker/intake.py`) : `prefetch=1` vaut pour chaque file, pas pour les deux ensemble. Pika
n'étant pas sûr entre threads, seul le thread principal touche la connexion ; une génération
calcule dans un autre thread pendant que le principal continue de servir la connexion
(battements de cœur) et de recevoir les livraisons, qui attendent leur tour.

Une génération publie `STARTED`, puis `RESULT` (issue, planning et manques, règles vérifiées)
ou `FAILED` avec `INVALID_MODEL` pour un problème incohérent ; sans planning légal, le résultat
n'en invente aucun. Une demande de plus de 1 Mio, ou illisible, est écartée sans nouvel essai.

À l'arrêt (`SIGTERM`), le calcul en cours est interrompu, les consommateurs sont annulés, puis
chaque livraison détenue est rendue par `basic.nack` : RabbitMQ 4.3 ne compte pas ce retour
dans la limite de livraisons, contrairement à `basic.reject` ou à une connexion perdue. La
boucle touche un fichier à chaque tour ; `python -m trame_engine.worker.health` le juge vivant
s'il a moins de 20 s : c'est la sonde du conteneur.

Pika 1.4.4 publie les rapports persistants avec confirmations et `mandatory` ; la demande
n'est acquittée qu'après les rapports confirmés. Une échéance POSIX de 5 s interrompt
l'attente de confirmation, puis la connexion incertaine est abandonnée, jamais réutilisée.
Sa fermeture est aussi bornée à 5 s ; si elle reste bloquée, le processus sort avec le code 75,
sans ACK. La supervision d'US-005 le redémarrera ; en local, relancer la commande après une
sortie non nulle. Les cibles de cette étape sont Linux (CI/VPS) et macOS, pas Windows natif.

Un crash peut faire recalculer la même demande : l'API garantit l'unicité du résultat visible,
pas une exécution physique exactement une fois du solveur. Les messages invalides sont rejetés
sans réattribution hasardeuse ; les erreurs de traitement sont reprises avec délai puis isolées.
Le worker et sa configuration vivent dans `src/trame_engine/worker/`. Le calcul reste dans
`solver`, les modèles échangés sont toujours générés.

Les rapports confirmés du diagnostic sont journalisés avec `run_id`, `request_id` et
`report_id`. Le même `run_id` apparaît dans les réponses HTTP et SSE ; les logs ne
contiennent ni jeton ni identité utilisateur.
