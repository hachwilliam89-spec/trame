# ADR-0026 — Socle technique réutilisable (`libs/platform`)

- **Statut** : Accepté (2026-11-01)
- **Contexte** : une partie du socle n'a rien de propre à la planification : messagerie fiable, temps, erreurs, configuration, logs, santé, authentification, audit. Kim prévoit de la reprendre dans d'autres projets. Mêlée au métier, elle devrait être démêlée avant chaque reprise.
- **Décision** :
  - Le socle générique de l'API vit dans `libs/platform/<module>`, avec le tag `scope:platform` : `clock`, `problem-details`, `zod-validation`, `config`, `logging`, `health`, `outbox`, `inbox`, `idempotency`, `auth`, `audit`.
  - Une lib `scope:platform` n'importe que d'autres libs `scope:platform`. Elle ne contient aucun terme de la planification (shift, employé, contrat, règle légale…). Ses paramètres sont injectés, jamais lus dans la configuration de Trame.
  - Un module n'entre dans `platform` que s'il sert déjà Trame : pas de généralisation par anticipation.
  - Chaque lib `platform` a son README (rôle, API publique, configuration) et ses propres tests.
  - Le design system sépare les composants, génériques, des tokens de marque, propres à Trame : un autre projet reprend les composants avec ses propres tokens.
  - Une ADR dont la décision est générique est rédigée sans vocabulaire métier, pour être reprise telle quelle.
  - La reprise se fait par copie, sous la licence MIT du dépôt. Pas de paquets publiés tant qu'il n'y a pas un second projet qui les consomme.
- **Conséquences** :
  - (+) Le socle se transfère en copiant des dossiers et leurs ADR, sans démêlage.
  - (+) La frontière est vérifiée par `@nx/enforce-module-boundaries`, comme les autres.
  - (−) Une discipline de nommage et de paramétrage dans les libs `platform`.
- **Alternatives écartées** :
  - paquets npm publiés dès maintenant : des versions à maintenir sans second consommateur ;
  - dépôt modèle séparé : prématuré, il divergerait de Trame.
