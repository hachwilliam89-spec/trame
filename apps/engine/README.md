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

## Commandes

```bash
pnpm nx run engine:install     # uv sync --frozen
pnpm nx serve engine           # http://127.0.0.1:8000/health
pnpm nx test engine
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

## Worker de diagnostic (US-009 A2)

`pnpm nx run engine:worker` démarre un consommateur AMQP indépendant du serveur FastAPI.
Il exige `AMQP_URL`, utilise la topologie commune versionnée dans `infra/rabbitmq`,
et ne lit ni n'écrit PostgreSQL. `DIAGNOSTIC_TOPOLOGY_FILE`, facultatif, doit être un chemin
absolu si le fichier par défaut est remplacé. Le diagnostic utilise un worker CP-SAT,
une graine de 0 et une limite de 5 s, indépendamment du plafond futur des vrais plannings.

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
