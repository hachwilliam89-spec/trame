import { execFile } from 'node:child_process';

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Lance une commande et rend son résultat, sans lever d'erreur sur un code de sortie non nul :
 * `gh pr checks` sort en 8 quand des checks sont en cours, ce n'est pas une panne.
 */
export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

export function createCommandRunner(workingDirectory: string): CommandRunner {
  return (command, args) =>
    new Promise((resolve) => {
      execFile(command, args, { cwd: workingDirectory }, (error, stdout, stderr) => {
        resolve({ exitCode: exitCodeOf(error), stdout, stderr });
      });
    });
}

function exitCodeOf(error: Error | null): number {
  if (error === null) {
    return 0;
  }
  const code = (error as NodeJS.ErrnoException).code;
  if (typeof code === 'number') {
    return code;
  }
  // Commande introuvable (ENOENT) ou tuée par un signal : on la traite comme un échec.
  return 1;
}
