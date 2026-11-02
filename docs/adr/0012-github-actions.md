# ADR-0012 — GitHub Actions sur runners hébergés, miroir GitLab UHA

- **Statut** : Accepté, miroir GitLab UHA remplacé par ADR-0017
- **Contexte** : le projet doit être visible des recruteurs, et le VPS ne doit pas être chargé par les builds.
- **Décision** : GitHub est le dépôt principal, et la CI tourne sur GitHub Actions avec les runners hébergés. Le dépôt est poussé en miroir sur GitLab UHA.
- **Conséquences** :
  - (+) Badges et historique visibles, aucune charge sur le VPS.
  - (−) Aucune, côté VPS : le runner GitLab qui y tournait (projet Équilibre, terminé) a été retiré le 2026-11-01.
- **Alternatives écartées** : GitLab CI comme CI principale (moins visible des recruteurs).
