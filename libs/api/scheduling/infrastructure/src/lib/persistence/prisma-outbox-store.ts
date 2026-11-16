import { PrismaService, instantToDate } from '@trame/api/database';
import type { Clock } from '@trame/platform/clock';
import type { OutboxStore, OutgoingMessage } from '@trame/platform/outbox';

/**
 * Ne prend que les types que son relais sait router. Le filtre est dans la sélection, avant
 * `LIMIT 1` : un message d'un autre type, en tête de file, ne bloque jamais ceux qui le suivent,
 * même après un retour à une version qui ne le connaît pas.
 */
export class PrismaOutboxStore implements OutboxStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly routedTypes: readonly string[],
  ) {}
  async publishNext(publish: (message: OutgoingMessage) => Promise<void>): Promise<boolean> {
    return this.prisma.$transaction(
      async (transaction) => {
        const [message] = await transaction.$queryRaw<OutgoingMessage[]>`
        SELECT id, organization_id AS "organizationId", type, body
        FROM scheduling.outbox_messages
        WHERE published_at IS NULL AND type = ANY(${[...this.routedTypes]}::text[])
        ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED
      `;
        if (message === undefined) {
          return false;
        }
        await publish(message);
        await transaction.outboxMessage.update({
          where: { id: message.id, organizationId: message.organizationId },
          data: { publishedAt: instantToDate(this.clock.now()) },
        });
        return true;
      },
      { timeout: 15_000 },
    );
  }
}
