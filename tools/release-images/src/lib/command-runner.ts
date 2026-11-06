import { execFile } from 'node:child_process';

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CommandOptions {
  /** Variables d'environnement ajoutées à celles du processus. */
  environment?: Record<string, string>;
  /** Dossier courant : `oras push` refuse les chemins absolus. */
  workingDirectory?: string;
}

/** Lance une commande et rend son résultat, sans lever d'erreur sur un code de sortie non nul. */
export type CommandRunner = (
  command: string,
  args: string[],
  options?: CommandOptions,
) => Promise<CommandResult>;

/** Une commande attendue a échoué ; le message reprend sa sortie d'erreur. */
export class CommandFailedError extends Error {}

export function createCommandRunner(): CommandRunner {
  return (command, args, options = {}) =>
    new Promise((resolve) => {
      const env = { ...process.env, ...options.environment };
      // Les sorties de cosign et de gh peuvent dépasser le tampon par défaut d'1 Mio.
      const maxBuffer = 64 * 1024 * 1024;
      const cwd = options.workingDirectory;
      execFile(command, args, { env, maxBuffer, cwd }, (error, stdout, stderr) => {
        resolve({ exitCode: exitCodeOf(error), stdout, stderr });
      });
    });
}

/** Lance la commande et rend sa sortie standard, ou lève une erreur qui la nomme. */
export async function runOrFail(
  run: CommandRunner,
  command: string,
  args: string[],
  options?: CommandOptions,
): Promise<string> {
  const result = await run(command, args, options);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || `code de sortie ${result.exitCode}`;
    throw new CommandFailedError(`${command} ${args[0] ?? ''} a échoué : ${detail}`);
  }
  return result.stdout;
}

function exitCodeOf(error: (Error & { code?: unknown }) | null): number {
  if (error === null) {
    return 0;
  }
  if (typeof error.code === 'number') {
    return error.code;
  }
  // Commande introuvable (ENOENT) ou tuée par un signal : un échec.
  return 1;
}
