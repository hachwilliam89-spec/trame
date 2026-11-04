import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
export interface OutboxMessage<Payload> {
  id: string;
  organizationId: string;
  type: string;
  occurredAt: string;
  payload: Payload;
}
export function prepareOutboxMessage<Payload>(
  input: Pick<OutboxMessage<Payload>, 'organizationId' | 'type' | 'payload'>,
  clock: Clock,
  ids: IdGenerator,
): OutboxMessage<Payload> {
  return { ...input, id: ids.next(), occurredAt: clock.now().toString() };
}
