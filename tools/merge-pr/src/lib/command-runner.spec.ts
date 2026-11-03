import { tmpdir } from 'node:os';
import { createCommandRunner } from './command-runner';

describe('createCommandRunner', () => {
  const run = createCommandRunner(tmpdir());

  it('rend la sortie et le code de sortie, sans lever d’erreur sur un échec', async () => {
    const result = await run('sh', ['-c', 'echo sortie; echo erreur >&2; exit 8']);

    expect(result).toEqual({
      exitCode: 8,
      stdout: 'sortie\n',
      stderr: 'erreur\n',
      timedOut: false,
    });
  });

  it('interrompt une commande qui dépasse sa durée maximale', async () => {
    const result = await run('sleep', ['5'], { timeoutMilliseconds: 200 });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  it('accepte une durée maximale fractionnaire, comme en donne une horloge monotone', async () => {
    const result = await run('sleep', ['5'], { timeoutMilliseconds: 0.4 });

    expect(result.timedOut).toBe(true);
  });

  it('laisse finir une commande plus rapide que sa durée maximale', async () => {
    const result = await run('sh', ['-c', 'echo ok'], { timeoutMilliseconds: 5_000 });

    expect(result).toEqual({ exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false });
  });
});
