# ADR-0018 — Contrats partagés : zod → JSON Schema → Pydantic

- **Statut** : Accepté (2026-11-01)
- **Contexte** : les mêmes structures circulent entre Angular, NestJS et le moteur Python. Sans source commune, le premier changement de contrat casse la communication en silence. La bibliothèque `nestjs-zod` ne supporte pas encore NestJS 12.
- **Décision** :
  - Les schémas zod 4 de `libs/shared/contracts` sont la source unique pour le front et l'API.
  - L'API valide ses entrées avec un `ZodValidationPipe` maison (une vingtaine de lignes), et sa spec OpenAPI est produite à partir de `z.toJSONSchema()`.
  - Les schémas des messages API ↔ moteur sont exportés en JSON Schema. Les modèles Pydantic du moteur en sont générés (datamodel-code-generator) par `pnpm nx run contracts:generate`.
  - La CI régénère les modèles et échoue s'ils diffèrent de ceux du dépôt. Des tests de contrat valident des messages réels, des deux côtés.
  - _Amendement_ : `z.toJSONSchema()` échoue sur les constructions non représentables (`transform`, validation personnalisée, `z.date()`…). Les schémas échangés se limitent donc à un sous-ensemble exportable, et les dates circulent en chaînes ISO 8601. Un test exporte tous les schémas et valide des messages valides et invalides des deux côtés.
- **Conséquences** :
  - (+) Un changement de contrat casse la CI, jamais la production.
  - (−) Une étape de génération à maintenir, et une discipline sur les constructions zod autorisées.
- **Alternatives écartées** : `nestjs-zod` (incompatible avec NestJS 12) ; class-validator (non partageable avec le front ni le moteur) ; Protobuf (lourd pour ce volume).
