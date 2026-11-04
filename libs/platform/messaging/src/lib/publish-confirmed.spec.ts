import { EventEmitter } from 'node:events';
import type { ConfirmChannel } from 'amqplib';
import { publishConfirmed } from './publish-confirmed';
class FakeChannel extends EventEmitter {
  confirm: (error: unknown) => void = () => undefined;
  close = vi.fn(async () => undefined);
  publish = vi.fn((_exchange, _key, _body, _options, callback: (error: unknown) => void) => {
    this.confirm = callback;
    return true;
  });
}
const destination = { exchange: 'test', routingKey: 'requested' };
afterEach(() => {
  vi.useRealTimers();
});
it('attend la confirmation et active persistance et mandatory', async () => {
  const channel = new FakeChannel();
  let finished = false;
  const pending = publishConfirmed(
    channel as unknown as ConfirmChannel,
    destination,
    Buffer.from('{}'),
  ).then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  expect(channel.publish.mock.calls[0]?.[3]).toMatchObject({ persistent: true, mandatory: true });
  channel.confirm(null);
  await pending;
});
it('refuse un message retourné, même si le broker confirme ensuite la publication', async () => {
  const channel = new FakeChannel();
  const pending = publishConfirmed(
    channel as unknown as ConfirmChannel,
    destination,
    Buffer.from('{}'),
  );
  channel.emit('return');
  channel.confirm(null);
  await expect(pending).rejects.toThrow();
});
it('borne l’attente, ferme le canal incertain et retire ses listeners', async () => {
  vi.useFakeTimers();
  const channel = new FakeChannel();
  const pending = publishConfirmed(
    channel as unknown as ConfirmChannel,
    destination,
    Buffer.from('{}'),
    50,
  );
  const rejected = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(50);
  await rejected;
  expect(channel.close).toHaveBeenCalledTimes(1);
  expect(channel.listenerCount('return')).toBe(0);
});
