import { execFile } from 'node:child_process';
import { type Deadline, DeadlineExceededError } from './deadline';

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** La commande a été interrompue parce qu'elle dépassait sa durée maximale. */
  timedOut?: boolean;
}

export interface CommandOptions {
  /** Variables d'environnement ajoutées à celles du processus. */
  environment?: Record<string, string>;
  /** Dossier courant : `oras push` refuse les chemins absolus. */
  workingDirectory?: string;
  timeoutMilliseconds?: number;
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
      const timeout = timeoutForExecFile(options.timeoutMilliseconds);
      execFile(command, args, { env, maxBuffer, cwd, timeout }, (error, stdout, stderr) => {
        const timedOut = timeout > 0 && error?.killed === true;
        resolve({ exitCode: exitCodeOf(error), stdout, stderr, timedOut });
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

/**
 * execFile exige un entier, et `0` y signifie « sans limite ». Arrondir par excès garde une
 * durée fractionnaire positive (horloge monotone) au moins à 1 ms, jamais à « sans limite ».
 */
function timeoutForExecFile(timeoutMilliseconds: number | undefined): number {
  if (timeoutMilliseconds === undefined) {
    return 0;
  }
  return Math.ceil(timeoutMilliseconds);
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

/** Lanceur dont chaque commande est bornée par le temps restant avant l'échéance. */
export function createDeadlineRunner(run: CommandRunner, deadline: Deadline): CommandRunner {
  return async (command, args, options = {}) => {
    const label = `${command} ${args[0] ?? ''}`;
    const remainingMilliseconds = deadline.remainingMilliseconds();
    if (remainingMilliseconds === 0) {
      throw new DeadlineExceededError(`${label} non lancé`);
    }
    const result = await run(command, args, {
      ...options,
      timeoutMilliseconds: remainingMilliseconds,
    });
    if (result.timedOut === true) {
      throw new DeadlineExceededError(`${label} interrompu`);
    }
    return result;
  };
}
