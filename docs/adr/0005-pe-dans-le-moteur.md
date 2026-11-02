# ADR-0005 — PE implémentée une seule fois, dans le moteur

- **Statut** : Accepté, précisée par ADR-0020
- **Contexte** : la PE évalue chaque modification manuelle. La même logique de contraintes existe déjà dans le solveur.
- **Décision** : la PE vit dans le moteur et est exposée en HTTP synchrone. Le front l'appelle via l'API, avec un debounce sur le drag & drop.
- **Conséquences** :
  - (+) Une seule source de vérité pour les règles. La PE sert d'oracle pour les tests de propriétés du solveur.
  - (−) Un aller-retour réseau par évaluation, donc une cible p95 < 200 ms à surveiller.
- **Alternatives écartées** : une copie en TypeScript côté front (retour instantané, mais logique dupliquée et risque de divergence).
