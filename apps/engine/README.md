# Moteur d'optimisation (`apps/engine`)

Service Python sans état (ADR-0004) : il reçoit un problème complet, le résout avec OR-Tools CP-SAT et renvoie une solution et son explication. Il ne lit ni n'écrit jamais la base.

## Structure

```
src/trame_engine/
  api/        adaptateur HTTP (FastAPI)
  solver/     modèles CP-SAT et PE, sans dépendance HTTP ni configuration
  contracts/  modèles Pydantic GÉNÉRÉS depuis libs/shared/contracts : ne pas éditer
  settings.py configuration validée au démarrage (variables ENGINE_*)
  logs.py     logs structurés (structlog)
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
