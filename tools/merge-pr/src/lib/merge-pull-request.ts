import { GhCommandError, type GitHubCli } from './gh-cli';
import { type NextStep, decideNextStep, missingMandatoryChecks } from './merge-decision';

export interface MergeOptions {
  number: number;
  /** Nombre de lectures de l'état de la PR avant d'abandonner. */
  maxAttempts: number;
  pauseBetweenAttempts: () => Promise<void>;
  report: (message: string) => void;
}

export interface MergedPullRequest {
  headRefName: string;
  headCommit: string;
}

/** Arrêt volontaire du script : rien n'a été fusionné. */
export class MergeStoppedError extends Error {}

/**
 * Fusionne la PR en squash, une fois prouvé que son dernier commit a passé tous les checks requis.
 * La branche en retard est mise à jour par GitHub, puis ses nouveaux checks sont attendus.
 */
export async function mergePullRequest(
  gitHub: GitHubCli,
  options: MergeOptions,
): Promise<MergedPullRequest> {
  const requiredCheckNames = await readRequiredCheckNames(gitHub);

  let lastReason = 'aucune lecture';
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    const pullRequest = await gitHub.readPullRequest(options.number);
    const checks = await gitHub.readChecks(options.number);
    const step = decideNextStep({ pullRequest, requiredCheckNames, checks });

    if (step.kind === 'merge') {
      await merge(gitHub, options.number, step.headCommit);
      return { headRefName: pullRequest.headRefName, headCommit: step.headCommit };
    }
    lastReason = await applyStep(gitHub, step, options);
    await options.pauseBetweenAttempts();
  }
  throw new MergeStoppedError(`Délai dépassé. Dernier état : ${lastReason}`);
}

async function readRequiredCheckNames(gitHub: GitHubCli): Promise<string[]> {
  const requiredCheckNames = await gitHub.readRequiredCheckNames();
  const missingNames = missingMandatoryChecks(requiredCheckNames);
  if (missingNames.length > 0) {
    throw new MergeStoppedError(
      `La protection de main n’exige pas : ${missingNames.join(', ')}. Fusion refusée.`,
    );
  }
  return requiredCheckNames;
}

/** Applique une étape qui n'est pas la fusion, et rend la raison de l'attente. */
async function applyStep(
  gitHub: GitHubCli,
  step: Exclude<NextStep, { kind: 'merge' }>,
  options: MergeOptions,
): Promise<string> {
  if (step.kind === 'stop') {
    throw new MergeStoppedError(step.reason);
  }
  if (step.kind === 'update-branch') {
    options.report('Branche en retard sur main : mise à jour par GitHub.');
    await gitHub.updateBranch(options.number);
    return 'branche mise à jour, checks à relancer';
  }
  options.report(step.reason);
  return step.reason;
}

async function merge(gitHub: GitHubCli, number: number, headCommit: string): Promise<void> {
  try {
    await gitHub.merge(number, headCommit);
  } catch (error) {
    if (error instanceof GhCommandError) {
      throw new MergeStoppedError(`GitHub a refusé la fusion : ${error.detail}`);
    }
    throw error;
  }
}
