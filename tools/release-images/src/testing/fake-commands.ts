import type { CommandOptions, CommandResult, CommandRunner } from '../lib/command-runner';

type Handler = (args: string[], options?: CommandOptions) => CommandResult | Promise<CommandResult>;

/**
 * Faux exécutables (cosign, oras, gh) : chaque commande est confiée au gestionnaire enregistré
 * pour son nom et sa sous-commande. Chaque appel est noté, pour vérifier ce qui a été demandé.
 */
export class FakeCommands {
  readonly calls: string[][] = [];
  private readonly handlers = new Map<string, Handler>();

  on(command: string, subcommand: string, handler: Handler): this {
    this.handlers.set(`${command} ${subcommand}`, handler);
    return this;
  }

  readonly run: CommandRunner = async (command, args, options) => {
    this.calls.push([command, ...args]);
    const handler = this.handlers.get(`${command} ${args[0] ?? ''}`);
    if (handler === undefined) {
      throw new Error(`Appel inattendu : ${command} ${args.join(' ')}`);
    }
    return handler(args, options);
  };

  callsTo(command: string, subcommand: string): string[][] {
    return this.calls.filter((call) => call[0] === command && call[1] === subcommand);
  }
}

export function succeeds(stdout = ''): CommandResult {
  return { exitCode: 0, stdout, stderr: '' };
}

export function fails(stderr: string): CommandResult {
  return { exitCode: 1, stdout: '', stderr };
}
