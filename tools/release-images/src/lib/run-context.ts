import type { RunContext } from './publish-gate';

/** Lit le contexte du run dans les variables de GitHub Actions. */
export function readRunContext(environment: Record<string, string | undefined>): RunContext {
  return {
    eventName: requiredVariable(environment, 'GITHUB_EVENT_NAME'),
    ref: requiredVariable(environment, 'GITHUB_REF'),
    sha: requiredVariable(environment, 'GITHUB_SHA'),
    repository: requiredVariable(environment, 'GITHUB_REPOSITORY'),
  };
}

function requiredVariable(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name];
  if (value === undefined || value === '') {
    throw new Error(`Variable GitHub Actions manquante : ${name}.`);
  }
  return value;
}
