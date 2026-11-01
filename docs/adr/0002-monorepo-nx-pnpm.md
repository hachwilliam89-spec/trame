# ADR-0002 — Monorepo Nx + pnpm

- **Statut** : Accepté
- **Contexte** : le projet regroupe un front web, une app mobile, une API, un moteur Python et une doc, avec des types partagés.
- **Décision** : un monorepo Nx avec pnpm. Le moteur Python est géré par uv et intégré à Nx via des cibles `run-commands`.
- **Conséquences** :
  - (+) Libs partagées, frontières d'architecture vérifiées par `@nx/enforce-module-boundaries`, CI qui ne reconstruit que les projets touchés (`nx affected`).
  - (−) Une couche d'outillage de plus à maîtriser.
- **Alternatives écartées** : un repo par app (duplication des contrats) ; Turborepo (moins de règles d'architecture natives).
