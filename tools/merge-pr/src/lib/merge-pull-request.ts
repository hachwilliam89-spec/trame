import { type Deadline, DeadlineExceededError } from './deadline';
import { GhCommandError, type GitHubCli } from './gh-cli';
import { type NextStep, decideNextStep, missingMandatoryChecks } from './merge-decision';

export interface MergeOptions {
  number: number;
  /** Échéance commune à toutes les lectures, pauses et commandes. */
  deadline: Deadline;
  pauseMilliseconds: number;
  pause: (milliseconds: number) => Promise<void>;
  report: (message: string) => void;
}

export interface MergedPullRequest {
  headRefName: string;
  headCommit: string;
}

/** Arrêt volontaire du script : rien n'a été fusionné. */
export class MergeStoppedError extends Error {}

/** La fusion a été demandée mais sa réponse n'est pas arrivée : elle a peut-être eu lieu. */
export class MergeOutcomeUnknownError extends Error {}

/**
 * Fusionne la PR en squash, une fois prouvé que son dernier commit a passé tous les checks requis.
 * La branche en retard est mise à jour par GitHub, puis ses nouveaux checks sont attendus.
 * L'échéance est mesurée : le temps des commandes `gh` compte autant que les pauses.
 */
export async function mergePullRequest(
  gitHub: GitHubCli,
  options: MergeOptions,
): Promise<MergedPullRequest> {
  try {
    const requiredCheckNames = await readRequiredCheckNames(gitHub);
    return await mergeWhenReady(gitHub, requiredCheckNames, options);
  } catch (error) {
    if (error instanceof DeadlineExceededError) {
      throw new MergeStoppedError(`Délai dépassé. Dernier état : ${error.message}`);
    }
    throw error;
  }
}

async function mergeWhenReady(
  gitHub: GitHubCli,
  requiredCheckNames: string[],
  options: MergeOptions,
): Promise<MergedPullRequest> {
  const { deadline } = options;
  let lastReason = 'aucune lecture';

  while (!deadline.isExpired()) {
    const pullRequest = await gitHub.readPullRequest(options.number);
    const checks = await gitHub.readChecks(options.number);
    const step = decideNextStep({ pullRequest, requiredCheckNames, checks });

    if (step.kind === 'merge') {
      await merge(gitHub, options.number, step.headCommit);
      return { headRefName: pullRequest.headRefName, headCommit: step.headCommit };
    }
    lastReason = await applyStep(gitHub, step, options);
    await options.pause(Math.min(options.pauseMilliseconds, deadline.remainingMilliseconds()));
  }
  throw new DeadlineExceededError(lastReason, false);
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

/**
 * Une fusion jamais lancée faute de temps reste un simple dépassement de délai. Une fusion
 * interrompue en cours a pu aboutir côté GitHub : on le dit, plutôt que d'affirmer le contraire.
 */
async function merge(gitHub: GitHubCli, number: number, headCommit: string): Promise<void> {
  try {
    await gitHub.merge(number, headCommit);
  } catch (error) {
    if (error instanceof GhCommandError) {
      throw new MergeStoppedError(`GitHub a refusé la fusion : ${error.detail}`);
    }
    if (error instanceof DeadlineExceededError && error.commandStarted) {
      throw new MergeOutcomeUnknownError(
        `Délai atteint pendant la fusion : la PR #${number} est peut-être fusionnée. Vérifie avec \`gh pr view ${number}\`.`,
      );
    }
    throw error;
  }
}
