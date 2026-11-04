# Outbox

`OutboxMessage<Payload>` décrit une enveloppe : `id`, `organizationId`, `type`,
`occurredAt` (ISO 8601) et `payload`.
`prepareOutboxMessage(input, clock, ids)` lui attribue un identifiant propre et l'instant
fourni par les ports injectés. Aucune configuration ni connaissance du contenu métier.

Cette fonction ne persiste ni ne publie le message. L'adaptateur du contexte conserve
l'enveloppe avec la modification métier, dans la même transaction. Le schéma zod du
message échangé reste dans `shared/contracts` ; cette lib ne dépend pas de Prisma.
Le relais avec confirmation RabbitMQ est raccordé par US-009 A2.

Tests : `pnpm nx run platform-outbox:test`.

`OutboxRelay` relie le port `OutboxStore` au port `MessagePublisher`. `publishNext` verrouille
une ligne et ne la marque envoyée qu'après succès de la publication. L'implémentation Prisma
reste dans le contexte consommateur ; le relais générique ne connaît ni SQL ni le payload.
Une confirmation suivie d'un crash avant commit peut produire un doublon : l'inbox et la
transition métier doivent le tolérer. Scheduling vérifie ces garanties sur PostgreSQL/RabbitMQ.
