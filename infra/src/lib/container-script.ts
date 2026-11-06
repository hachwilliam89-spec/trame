import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';

export interface ScriptRun {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface ContainerScript {
  containerId: string;
  /** Interpréteur lancé dans le conteneur, qui lit le script sur son entrée standard. */
  command: string[];
  scriptPath: string;
  /** Paramètres et secrets du script, transmis par l'environnement. */
  environment: Record<string, string>;
}

const SCRIPT_TIMEOUT_MILLISECONDS = 60_000;

/**
 * Lance un script de provisionnement comme sur le VPS : le script arrive sur l'entrée standard, et
 * chaque variable passe par `docker exec --env NOM`, sans valeur. Les secrets ne figurent donc
 * jamais dans les arguments d'un processus, visibles par `ps`.
 */
export function runScriptInContainer(script: ContainerScript): Promise<ScriptRun> {
  const environmentArguments: string[] = [];
  for (const name of Object.keys(script.environment)) {
    environmentArguments.push('--env', name);
  }
  const child = spawn(
    'docker',
    ['exec', '--interactive', ...environmentArguments, script.containerId, ...script.command],
    {
      env: { ...process.env, ...script.environment },
      signal: AbortSignal.timeout(SCRIPT_TIMEOUT_MILLISECONDS),
    },
  );
  createReadStream(script.scriptPath).pipe(child.stdin);

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}
