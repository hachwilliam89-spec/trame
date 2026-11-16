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
- Chaque contrat a des fixtures dans `fixtures/<Contrat>/valid` et `fixtures/<Contrat>/invalid`. Elles sont validées côté TypeScript (`src/engine-contracts.spec.ts`) et côté Python (`apps/engine/tests/test_contracts.py`). Un dossier de fixtures sans contrat enregistré fait échouer les tests.
- Les sous-schémas que le moteur manipule directement sont enregistrés dans `engineContractParts` : ils deviennent des classes Pydantic à leur nom (`SchedulingProblemV1`, `MinimumDailyRestRuleV1`…) au lieu de noms déduits des champs. Ce ne sont pas des messages ; leurs exemples vivent dans les fixtures des contrats qui les contiennent.
- Les invariants entre champs (minimum ≤ maximum d'un contrat, fin après début d'un shift, identifiants uniques) ne s'expriment pas sans `refine` : le moteur les vérifie et répond `FAILED` avec `INVALID_MODEL`.

## Génération d'un planning

`ScheduleRequestedV1` (`scheduling.schedule-requested.v1`) porte un instantané complet du problème, puisque le moteur ne lit jamais la base : les shifts (un par créneau, poste et jour qui a un besoin, avec leurs instants calculés par l'API dans le fuseau du site et leur temps effectif), les salariés par identifiant seulement, avec leurs habilitations et le contrat qui couvre toute la semaine, les six règles du jalon 1 avec leurs paramètres, et l'objectif. `ScheduleReportedV1` (`scheduling.schedule-reported.v1`) renvoie `STARTED`, `RESULT` ou `FAILED` ; le résultat traite les cinq issues du solveur, le planning (affectations et manques chiffrés) n'existant que pour celles qui en trouvent un, avec les règles vérifiées et la durée de la résolution.
