# Outbox

`OutboxMessage<Payload>` décrit une enveloppe : `id`, `organizationId`, `type`,
`occurredAt` (ISO 8601) et `payload`.
`prepareOutboxMessage(input, clock, ids)` lui attribue un identifiant propre et l'instant
fourni par les ports injectés. Aucune configuration ni connaissance du contenu métier.

Cette fonction ne persiste ni ne publie le message. L'adaptateur du contexte conserve
l'enveloppe avec la modification métier, dans la même transaction. Le schéma zod du
message échangé reste dans `shared/contracts` ; cette lib ne dépend pas de Prisma.
Le relais avec confirmation RabbitMQ viendra dans US-009 A2.

Tests : `pnpm nx run platform-outbox:test`.
