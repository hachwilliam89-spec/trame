## Story

<!-- US-XXX — titre. Une PR = une story, ou une étape annoncée d'une story. -->

## Contenu

<!-- Ce qui change, par périmètre (api, web, engine, contracts, platform…). -->

## BDD et TDD

<!-- Relier chaque scénario métier validé au fichier et au nom de son test d'acceptation. -->

| Scénario BDD | Test d'acceptation (fichier et nom) |
| ------------ | ----------------------------------- |
|              |                                     |

<!-- Résumer les cycles TDD : commande et échec réellement observé avant le code/correctif, résultat après, refactorisation effectuée si nécessaire. Pour les changements sans comportement exécutable (documentation, mise en forme…), indiquer « Non applicable » et la vérification adaptée. Pour une refactorisation, préciser les tests qui préservent le comportement. -->

## Vérification

<!-- Commandes lancées et résultats. La CI doit être verte. -->

- [ ] `pnpm nx affected -t lint typecheck test build --base=origin/main`
- [ ] `pnpm nx run-many -t integration` (si la persistance est touchée)
- [ ] `pnpm nx run contracts:generate`, résultat commité (si un contrat a changé)

## Points à valider

<!-- Doutes, écarts par rapport au plan, décisions à prendre. « Aucun » si rien. -->

## Dépendances ajoutées

<!-- Pour chacune : pourquoi celle-ci, quelles alternatives. « Aucune » si rien. -->

## Definition of Ready

- [ ] La user story et sa valeur sont claires
- [ ] Les scénarios BDD sont écrits en Gherkin et validés avec Kim (cas nominal, refus et limites pertinents)
- [ ] Les questions métier bloquantes sont résolues
- [ ] La maquette est validée, si la story touche l'interface
- [ ] Les contrats (schémas zod) concernés sont identifiés
- [ ] Les dépendances sont terminées, ou simulables
- [ ] Elle tient dans une PR lisible

## Definition of Done

- [ ] Chaque scénario BDD est relié à un test d'acceptation qui passe
- [ ] Cycle TDD exécuté et résumé dans la PR, ou non-applicabilité expliquée avec la vérification adaptée
- [ ] Lint, typecheck et tests verts (CI)
- [ ] Aucune violation des frontières d'architecture
- [ ] Code lisible par un humain qui découvre le module (`AGENTS.md`, « Lisibilité »)
- [ ] Modèles Pydantic régénérés si un contrat a changé
- [ ] Test d'accès croisé pour chaque nouvel endpoint
- [ ] Doc à jour (et ADR si une décision a été prise)
- [ ] Migrations compatibles avec la version précédente de l'API (expand/contract)
- [ ] Revue croisée faite (l'agent qui écrit n'est pas celui qui relit), puis revue humaine
- [ ] Déployé sur staging et vérifié
