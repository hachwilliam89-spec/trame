# ADR-0013 — OpenTelemetry + Grafana ; Langfuse écarté

- **Statut** : Accepté
- **Contexte** : il faut une trace de bout en bout (front → API → RabbitMQ → moteur), et plus tard le suivi des appels au LLM, dans une RAM limitée.
- **Décision** : instrumentation OpenTelemetry vers Prometheus, Loki et Tempo, visualisés dans Grafana, avec des durées de rétention bornées. Les appels au LLM sont tracés selon les conventions sémantiques OTel GenAI, dans Tempo.
- **Conséquences** :
  - (+) Une seule stack, environ 1,5 Gio.
  - (−) Des dashboards LLM à construire soi-même.
- **Alternatives écartées** : Langfuse auto-hébergé (la v3 demande ClickHouse, Redis et un stockage S3, trop lourd pour le VPS).
