# ADR-0020 — Règles de planification : un objet, deux formes ; reproductibilité

- **Statut** : Accepté (2026-11-01). Précise ADR-0005.
- **Contexte** :
  - Dans le moteur, une règle existe sous deux formes : une contrainte CP-SAT pour le solveur, et une évaluation pour la PE. Les deux peuvent diverger.
  - En multi-thread, CP-SAT n'est pas déterministe, même avec une graine.
- **Décision** :
  - Chaque règle est une classe unique : un identifiant stable (ex. `REPOS_QUOTIDIEN_MIN`), ses paramètres, `add_to_model()` et `evaluate()`.
  - Un test de cohérence bidirectionnel (Hypothesis) accompagne chaque règle :
    - toute solution du solveur est jugée `FEASIBLE` par la PE ;
    - un planning aléatoire jugé `FEASIBLE` par la PE est accepté par le modèle quand on fige ses variables, et un planning jugé `INFEASIBLE` est rejeté.
  - Reproductibilité = problème, paramètres et solution stockés. Une nouvelle résolution identique n'est garantie qu'en mode déterministe (1 worker), réservé aux tests et aux benchmarks.
  - _Amendements_ :
    - **Légalité et couverture séparées.** Les règles légales et contractuelles sont des contraintes dures. La couverture est un objectif pénalisé en mode standard, et une contrainte en mode strict.
    - **Issue explicite de chaque résolution** : `OPTIMAL`, `FEASIBLE`, `INFEASIBLE` (aucun planning légal, même en mode standard), `UNKNOWN` (délai atteint sans solution), `CANCELLED` (avec ou sans solution partielle).
    - **Diagnostic.** En v0.1, c'est le manque de couverture chiffré par créneau et par compétence (mode standard). En mode strict, les littéraux d'hypothèse donnent un sous-ensemble minimisé mais pas forcément minimal, et leur analyse impose un seul worker (documentation d'OR-Tools). Le spike US-064 mesure le coût et la qualité des explications sur des cas Trame, et en fixe la granularité et le libellé.
    - **Stabilité** imposée par une pénalité explicite sur chaque changement. Les hints ne sont qu'une aide au solveur, sans garantie d'usage ni de gain de temps : leur effet est mesuré.
- **Conséquences** :
  - (+) Toute divergence entre solveur et PE est détectée par la CI.
  - (−) Chaque règle demande deux implémentations et un test de cohérence.
