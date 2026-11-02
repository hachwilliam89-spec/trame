# `@trame/shared/contracts`

Source unique des contrats échangés entre le front, l'API et le moteur (ADR-0018). Schémas zod 4.

## Contrats API ↔ moteur

Les schémas enregistrés dans `engineContracts` (`src/engine-contracts.ts`) sont exportés en JSON Schema, puis convertis en modèles Pydantic dans `apps/engine/src/trame_engine/contracts/` :

```bash
pnpm nx run contracts:generate   # export JSON Schema + génération Pydantic
pnpm nx run contracts:check      # échoue si les modèles générés ne sont pas à jour
```

Règles :

- Un schéma échangé reste exportable : pas de `transform`, pas de validation personnalisée (`refine`, `superRefine`), pas de `z.date()`. Les dates circulent en chaînes ISO 8601.
- Un changement incompatible crée une nouvelle version (`EngineHealthV2`), jamais une modification sur place.
- Les champs inconnus sont ignorés des deux côtés (export en mode `input`).
- Chaque contrat a des fixtures dans `fixtures/<Contrat>/valid` et `fixtures/<Contrat>/invalid`. Elles sont validées côté TypeScript (`src/engine-contracts.spec.ts`) et côté Python (`apps/engine/tests/test_contracts.py`).
