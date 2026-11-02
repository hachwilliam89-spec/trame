# Décisions d'architecture (ADR)

Format MADR abrégé, une décision par fichier. Une ADR acceptée ne se modifie pas : une nouvelle ADR la remplace et la marque « Remplacée par ADR-XXXX ». Une ADR rédigée pendant une tâche entre au statut « Proposé » et passe « Accepté » à la validation de Kim.

Les ADR 0018, 0020, 0021 et 0022 ont été amendées le 2026-11-01 après la revue croisée de Codex, avant toute implémentation. Une ADR dont la décision est générique est rédigée sans vocabulaire métier (ADR-0026).

| #                                                    | Décision                                                                | Statut                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| [0001](0001-sujet-planification-entrepot.md)         | Sujet : planification d'équipes en entrepôt logistique                  | Accepté                                   |
| [0002](0002-monorepo-nx-pnpm.md)                     | Monorepo Nx + pnpm                                                      | Accepté                                   |
| [0003](0003-monolithe-modulaire-hexagonal.md)        | API en monolithe modulaire hexagonal + DDD                              | Accepté                                   |
| [0004](0004-moteur-python-cp-sat-sans-etat.md)       | Moteur d'optimisation séparé : Python + OR-Tools CP-SAT, sans état      | Accepté                                   |
| [0005](0005-pe-dans-le-moteur.md)                    | PE implémentée une seule fois, dans le moteur                           | Accepté, précisée par 0020                |
| [0006](0006-postgresql.md)                           | PostgreSQL, pas de base NoSQL                                           | Accepté                                   |
| [0007](0007-rabbitmq-et-outbox.md)                   | RabbitMQ + pattern outbox pour les résolutions                          | Accepté                                   |
| [0008](0008-prisma.md)                               | Prisma comme ORM                                                        | Accepté                                   |
| [0009](0009-angular-cdk-tailwind.md)                 | Angular + CDK + Tailwind, design system maison ; mobile Ionic/Capacitor | Accepté, partie mobile remplacée par 0023 |
| [0010](0010-keycloak.md)                             | Keycloak pour l'authentification                                        | Accepté                                   |
| [0011](0011-docker-compose-et-traefik.md)            | Docker Compose + Traefik sur le VPS, pas de Kubernetes en v1            | Accepté                                   |
| [0012](0012-github-actions.md)                       | GitHub Actions sur runners hébergés, miroir GitLab UHA                  | Accepté, miroir remplacé par 0017         |
| [0013](0013-opentelemetry-et-grafana.md)             | OpenTelemetry + Grafana ; Langfuse écarté                               | Accepté                                   |
| [0014](0014-le-llm-ne-genere-pas-le-planning.md)     | Le LLM ne génère jamais le planning                                     | Accepté                                   |
| [0015](0015-llm-via-api-embeddings-locaux.md)        | LLM via API derrière un port, embeddings locaux                         | Accepté                                   |
| [0016](0016-proxy-mutualise-vps-edge.md)             | Proxy HTTP(S) mutualisé du VPS (dépôt vps-edge)                         | Accepté                                   |
| [0017](0017-depot-github-uniquement.md)              | Dépôt GitHub uniquement                                                 | Accepté                                   |
| [0018](0018-contrats-zod-json-schema-pydantic.md)    | Contrats partagés : zod → JSON Schema → Pydantic                        | Accepté                                   |
| [0019](0019-temps-utc-et-fuseau-du-site.md)          | Temps : UTC en base, fuseau du site pour les calculs                    | Accepté                                   |
| [0020](0020-regles-un-objet-deux-formes.md)          | Règles de planification : un objet, deux formes ; reproductibilité      | Accepté                                   |
| [0021](0021-conventions-api-et-messagerie.md)        | Conventions d'API et de messagerie                                      | Accepté                                   |
| [0022](0022-organization-id-et-schemas-postgres.md)  | Données : `organizationId` dès la v0.1, un schéma Postgres par contexte | Accepté                                   |
| [0023](0023-mobile-pwa-puis-capacitor.md)            | Mobile : PWA d'abord, Capacitor pour Android ensuite                    | Accepté                                   |
| [0024](0024-en-tetes-de-securite-sans-helmet.md)     | En-têtes de sécurité : Traefik et CSP du front, pas de helmet           | Accepté                                   |
| [0025](0025-demo-organisation-par-visiteur.md)       | Démo publique : une organisation éphémère par visiteur                  | Accepté                                   |
| [0026](0026-socle-reutilisable-libs-platform.md)     | Socle technique réutilisable (`libs/platform`)                          | Accepté                                   |
| [0027](0027-dates-avec-temporal.md)                  | Dates : Temporal                                                        | Accepté                                   |
| [0028](0028-types-de-probleme-uri-tag.md)            | Types de problème : URI `tag:`                                          | Accepté                                   |
| [0029](0029-graphe-de-dependances-par-soumission.md) | Graphe de dépendances : instantanés soumis par l'API                    | Proposé                                   |
