# ADR-0004 — Moteur d'optimisation séparé : Python + OR-Tools CP-SAT, sans état

- **Statut** : Accepté
- **Contexte** : la résolution est coûteuse en CPU et longue (de quelques secondes à une minute). L'écosystème optimisation et prévision est en Python.
- **Décision** : un service Python (FastAPI + worker AMQP) avec OR-Tools CP-SAT. Il reçoit un problème complet et renvoie une solution et son explication. Il n'accède jamais à la base.
- **Conséquences** :
  - (+) Il scale et se limite indépendamment, ses résolutions sont reproductibles, et le projet gagne un troisième langage, crédible.
  - (−) Deux écosystèmes à outiller (lint, tests, CI) et des contrats à versionner.
- **Alternatives écartées** :
  - Java + OR-Tools ou Timefold : capitalise sur l'acquis, mais l'écosystème prévision est plus pauvre ;
  - solveur en Node : bindings limités.
