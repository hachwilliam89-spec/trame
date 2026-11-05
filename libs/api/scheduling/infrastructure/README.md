### Progression SSE (US-009 A3)

`GET /api/v1/diagnostics/solver-runs/:runId/events` exige un Bearer valide dans
`Authorization`, rôle admin ou manager. Le jeton ne passe jamais dans l'URL.
Le flux `text/event-stream` émet des événements `diagnostic` : `id` est l'UUID stocké,
`data` suit `DiagnosticProgressV1` (runId, sequence, occurredAt, report).
`Last-Event-ID` reprend strictement après un événement de ce job. L'ordre repose sur
la séquence persistée, pas sur l'horloge du worker.

- 401/403 pour l'authentification/les rôles ; 404 pour job absent, mal formé ou étranger.
- 400 pour curseur mal formé ou inconnu du job ; les validations précèdent les en-têtes SSE.
- Sans curseur, l'historique conservé est rejoué. Le résultat terminal ferme le flux.
  Une reprise déjà au dernier événement terminal répond 204.
- Après une heure suivant `finishedAt`, le flux répond 410 ; GET du résultat et rejeu
  de la clé d'idempotence restent disponibles.
- Commentaire `: keepalive` toutes les 20 s. L'expiration vérifiée du jeton ferme la
  connexion, y compris pendant une lecture en attente ou face à un client lent.
- Une erreur de stockage après ouverture ferme le flux : reprendre avec le dernier id reçu.

L'adaptateur lit PostgreSQL chaque seconde par connexion, par lots de 50, sous snapshot
cohérent. C'est suffisant pour ce diagnostic fixe ; aucun nouveau canal de diffusion.
Le nettoyage tourne au démarrage de l'API puis chaque minute, sans chevauchement :
les événements expirés sont purgés, pas les jobs, l'outbox ou l'inbox. Si l'API est arrêtée,
la purge physique attend son redémarrage ; l'accès au flux expire quand même à une heure.

`runId` sert de corrélation : en-tête `X-Correlation-ID` au POST, GET et SSE, messages
existants et logs du worker. Cela ne constitue pas encore une trace distribuée Grafana.
La preuve locale complète se trouve dans `infra/src/keycloak.integration.spec.ts`.

Référence : [format, identifiants et reprise SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html).
