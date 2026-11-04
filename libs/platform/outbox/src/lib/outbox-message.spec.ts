import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { prepareOutboxMessage } from './outbox-message';
it('prépare une enveloppe stable avec l’organisation, une identité propre et l’instant injecté', () => {
  const clock = new FixedClock('2026-11-04T10:00:00Z');
  const ids = new SequentialIdGenerator();
  const input = {
    organizationId: 'organisation-a',
    type: 'example.requested.v1',
    payload: { id: 'resource' },
  };
  const first = prepareOutboxMessage(input, clock, ids);
  const second = prepareOutboxMessage(input, clock, ids);
  expect(first).toEqual({
    ...input,
    id: '00000000-0000-7000-8000-000000000001',
    occurredAt: '2026-11-04T10:00:00Z',
  });
  expect(second.id).not.toBe(first.id);
});
