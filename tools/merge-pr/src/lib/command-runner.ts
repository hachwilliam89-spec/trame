import { type ExecFileException, execFile } from 'node:child_process';

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** La commande a été interrompue parce qu'elle dépassait sa durée maximale. */
  timedOut: boolean;
}

export interface CommandOptions {
  timeoutMilliseconds?: number;
}

/**
 * Lance une commande et rend son résultat, sans lever d'erreur sur un code de sortie non nul :
 * `gh pr checks` sort en 8 quand des checks sont en cours, ce n'est pas une panne.
 */
export type CommandRunner = (
  command: string,
  args: string[],
  options?: CommandOptions,
) => Promise<CommandResult>;

export function createCommandRunner(workingDirectory: string): CommandRunner {
  return (command, args, options = {}) =>
    new Promise((resolve) => {
      const timeout = timeoutForExecFile(options.timeoutMilliseconds);
      execFile(command, args, { cwd: workingDirectory, timeout }, (error, stdout, stderr) => {
        const timedOut = timeout > 0 && error?.killed === true;
        resolve({ exitCode: exitCodeOf(error), stdout, stderr, timedOut });
      });
    });
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

function exitCodeOf(error: ExecFileException | null): number {
  if (error === null) {
    return 0;
  }
  const code = error.code;
  if (typeof code === 'number') {
    return code;
  }
  // Commande introuvable (ENOENT) ou tuée par un signal : on la traite comme un échec.
  return 1;
}
