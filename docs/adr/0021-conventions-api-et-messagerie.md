# ADR-0021 — Conventions d'API et de messagerie

- **Statut** : Accepté (2026-11-01)
- **Contexte** : RabbitMQ livre au moins une fois, un double clic peut lancer deux résolutions, et une connexion SSE silencieuse finit par être coupée.
- **Décision** :
  - **API** : préfixe `/api/v1`, erreurs au format RFC 9457 (`application/problem+json`), pagination par curseur, en-tête `X-Powered-By` masqué.
  - **Idempotence** : en-tête `Idempotency-Key` obligatoire sur les POST qui déclenchent un traitement (génération). La même clé renvoie le même job.
  - **Outbox** : relais par lecture de la table en `FOR UPDATE SKIP LOCKED`.
  - **Inbox** : chaque message reçu du moteur est enregistré par identifiant, et les doublons sont ignorés.
  - **SSE** : message de maintien toutes les 20 s, reprise par `Last-Event-ID`. _Amendement_ : les événements sont numérotés dans l'ordre, stockés et conservés 1 h après la fin du job, puis purgés.
  - **Messages** : nommés `<contexte>.<événement>.v<N>`, avec un schéma versionné (ADR-0018).
- **Conséquences** :
  - (+) Aucun traitement en double, aucune perte silencieuse, des erreurs homogènes.
  - (−) Deux tables techniques (outbox, inbox) et leur purge à prévoir.
