## Story

<!-- US-XXX — titre. Une PR = une story, ou une étape annoncée d'une story. -->

## Contenu

<!-- Ce qui change, par périmètre (api, web, engine, contracts, platform…). -->

## Vérification

<!-- Commandes lancées et résultats. La CI doit être verte. -->

- [ ] `pnpm nx affected -t lint typecheck test build --base=origin/main`
- [ ] `pnpm nx run api-database:integration` (si la persistance est touchée)
- [ ] `pnpm nx run contracts:generate`, résultat commité (si un contrat a changé)

## Points à valider

<!-- Doutes, écarts par rapport au plan, décisions à prendre. « Aucun » si rien. -->

## Dépendances ajoutées

<!-- Pour chacune : pourquoi celle-ci, quelles alternatives. « Aucune » si rien. -->

## Definition of Ready

- [ ] La user story et sa valeur sont claires
- [ ] Les critères d'acceptation sont écrits en Gherkin
- [ ] La maquette est validée, si la story touche l'interface
- [ ] Les contrats (schémas zod) concernés sont identifiés
- [ ] Les dépendances sont terminées, ou simulables
- [ ] Elle tient dans une PR lisible

## Definition of Done

- [ ] Critères d'acceptation couverts par des tests qui passent
- [ ] Lint, typecheck et tests verts (CI)
- [ ] Aucune violation des frontières d'architecture
- [ ] Modèles Pydantic régénérés si un contrat a changé
- [ ] Test d'accès croisé pour chaque nouvel endpoint
- [ ] Doc à jour (et ADR si une décision a été prise)
- [ ] Migrations compatibles avec la version précédente de l'API (expand/contract)
- [ ] Revue croisée faite (l'agent qui écrit n'est pas celui qui relit), puis revue humaine
- [ ] Déployé sur staging et vérifié
