import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandOptions {
  environment?: NodeJS.ProcessEnv;
  timeoutMilliseconds?: number;
  workingDirectory?: string;
}

export interface CommandRun {
  exitCode: number | null;
  output: string;
}

/** Lance une commande et rend sa sortie standard ; échoue avec sa sortie d'erreur. */
export async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    env: options.environment ?? process.env,
    cwd: options.workingDirectory,
    timeout: options.timeoutMilliseconds ?? 600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Lance une commande longue en recopiant sa sortie dans celle des tests, pour suivre le parcours
 * dans les journaux de la CI. Rend son code de sortie et sa sortie complète, sans échouer.
 */
export function runVisibleCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandRun> {
  const child = spawn(command, args, {
    env: options.environment ?? process.env,
    cwd: options.workingDirectory,
    signal: AbortSignal.timeout(options.timeoutMilliseconds ?? 900_000),
  });
  let output = '';
  const collect = (chunk: Buffer): void => {
    output += chunk.toString();
    process.stdout.write(chunk);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode) => resolve({ exitCode, output }));
  });
}
