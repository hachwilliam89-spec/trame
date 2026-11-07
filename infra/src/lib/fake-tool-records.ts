import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lecture des notes que les faux outils du banc de déploiement (infra/src/fixtures/staging-host)
 * laissent dans leur dossier d'état : leurs appels, et les digests que Docker Compose aurait
 * interpolés.
 */

/** Un appel à `docker compose`, découpé en options globales, sous-commande et arguments. */
export interface ComposeCall {
  project: string;
  envFile: string | undefined;
  file: string | undefined;
  subcommand: string;
  arguments: string[];
}

/** Les digests qu'un appel à Docker Compose interpolerait, par variable. */
export interface InterpolatedDigests {
  subcommand: string;
  digests: Record<string, string>;
}

const COMPOSE_OPTIONS_WITH_VALUE = ['--project-name', '--env-file', '--file'];

/** Les appels notés, chacun sous la forme [outil, ...arguments], éventuellement d'un seul outil. */
export function readToolCalls(stateDirectory: string, tool?: string): string[][] {
  const calls = nonEmptyLines(join(stateDirectory, 'calls')).map((line) =>
    line.replace(/\t$/, '').split('\t'),
  );
  if (tool === undefined) {
    return calls;
  }
  return calls.filter((call) => call[0] === tool);
}

export function readComposeCalls(stateDirectory: string): ComposeCall[] {
  const composeCalls: ComposeCall[] = [];
  for (const call of readToolCalls(stateDirectory, 'docker')) {
    if (call[1] === 'compose') {
      composeCalls.push(parseComposeCall(call.slice(2)));
    }
  }
  return composeCalls;
}

export function readInterpolatedDigests(stateDirectory: string): InterpolatedDigests[] {
  const interpolations: InterpolatedDigests[] = [];
  for (const line of nonEmptyLines(join(stateDirectory, 'compose-digests'))) {
    const [subcommand = '', ...assignments] = line.split('\t');
    const digests: Record<string, string> = {};
    for (const assignment of assignments) {
      const [variable = '', value = ''] = assignment.split('=');
      digests[variable] = value;
    }
    interpolations.push({ subcommand, digests });
  }
  return interpolations;
}

function nonEmptyLines(file: string): string[] {
  if (!existsSync(file)) {
    return [];
  }
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '');
}

function parseComposeCall(args: string[]): ComposeCall {
  const options: Record<string, string> = {};
  let index = 0;
  while (index < args.length && COMPOSE_OPTIONS_WITH_VALUE.includes(args[index] ?? '')) {
    options[args[index] ?? ''] = args[index + 1] ?? '';
    index += 2;
  }
  return {
    project: options['--project-name'] ?? '',
    envFile: options['--env-file'],
    file: options['--file'],
    subcommand: args[index] ?? '',
    arguments: args.slice(index + 1),
  };
}
