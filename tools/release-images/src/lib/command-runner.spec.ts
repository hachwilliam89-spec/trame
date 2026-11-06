import { FakeCommands, succeeds } from '../testing/fake-commands';
import { FakeStopwatch } from '../testing/fake-stopwatch';
import { createCommandRunner, createDeadlineRunner } from './command-runner';
import { Deadline, DeadlineExceededError } from './deadline';

describe('createCommandRunner', () => {
  const run = createCommandRunner();

  it('rend la sortie et le code de sortie, sans lever d’erreur sur un échec', async () => {
    const result = await run('sh', ['-c', 'echo sortie; echo erreur >&2; exit 8']);

    expect(result).toEqual({
      exitCode: 8,
      stdout: 'sortie\n',
      stderr: 'erreur\n',
      timedOut: false,
    });
  });

  it('interrompt une commande qui dépasse sa durée maximale, même fractionnaire', async () => {
    const result = await run('sleep', ['5'], { timeoutMilliseconds: 0.4 });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });
});

describe('createDeadlineRunner', () => {
  function deadlineRunner(budgetMilliseconds: number, elapsedMilliseconds: number) {
    const stopwatch = new FakeStopwatch();
    stopwatch.advance(elapsedMilliseconds);
    const commands = new FakeCommands();
    const options: (number | undefined)[] = [];
    commands.on('gh', 'api', (_args, commandOptions) => {
      options.push(commandOptions?.timeoutMilliseconds);
      return succeeds('ok');
    });
    const run = createDeadlineRunner(commands.run, new Deadline(stopwatch, budgetMilliseconds));
    return { run, commands, options };
  }

  it('borne chaque commande au temps restant', async () => {
    const { run, options } = deadlineRunner(60_000, 45_000);

    await run('gh', ['api', 'repos/x']);

    expect(options).toEqual([15_000]);
  });

  it('ne lance pas une commande une fois l’échéance atteinte', async () => {
    const { run, commands } = deadlineRunner(60_000, 60_000);

    await expect(run('gh', ['api', 'repos/x'])).rejects.toThrow(
      new DeadlineExceededError('gh api non lancé'),
    );
    expect(commands.calls).toEqual([]);
  });

  it('signale une commande interrompue par l’échéance', async () => {
    const stopwatch = new FakeStopwatch();
    const commands = new FakeCommands().on('gh', 'api', () => ({
      exitCode: 1,
      stdout: '',
      stderr: '',
      timedOut: true,
    }));
    const run = createDeadlineRunner(commands.run, new Deadline(stopwatch, 60_000));

    await expect(run('gh', ['api', 'repos/x'])).rejects.toThrow(
      new DeadlineExceededError('gh api interrompu'),
    );
  });
});
