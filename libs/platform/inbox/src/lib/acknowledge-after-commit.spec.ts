import { acknowledgeAfterCommit } from './acknowledge-after-commit';
it('attend le commit et n’acquitte jamais une écriture échouée', async () => {
  let release: () => void = () => undefined;
  const commit = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ack = vi.fn();
  const pending = acknowledgeAfterCommit(() => commit, ack);
  expect(ack).not.toHaveBeenCalled();
  release();
  await pending;
  expect(ack).toHaveBeenCalledTimes(1);
  ack.mockClear();
  await expect(
    acknowledgeAfterCommit(async () => {
      throw new Error('commit failed');
    }, ack),
  ).rejects.toThrow('commit failed');
  expect(ack).not.toHaveBeenCalled();
});
