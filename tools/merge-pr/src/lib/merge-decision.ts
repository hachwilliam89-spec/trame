/** État d'une PR, tel que le rend `gh pr view --json`. */
export interface PullRequestState {
  number: number;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  mergeStateStatus: string;
}

/** Catégorie d'un check, telle que la rend `gh pr checks --json bucket`. */
export type CheckBucket = 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel';

export interface CheckState {
  name: string;
  bucket: CheckBucket;
}

export type NextStep =
  | { kind: 'merge'; headCommit: string }
  | { kind: 'update-branch' }
  | { kind: 'wait'; reason: string }
  | { kind: 'stop'; reason: string };

export interface MergeSituation {
  pullRequest: PullRequestState;
  requiredCheckNames: string[];
  checks: CheckState[];
}

/** Checks que la protection de `main` doit exiger, sans quoi le script refuse de fusionner. */
export const MANDATORY_CHECK_NAMES = ['CI OK', 'CodeQL'];

export function missingMandatoryChecks(requiredCheckNames: string[]): string[] {
  return MANDATORY_CHECK_NAMES.filter((name) => !requiredCheckNames.includes(name));
}

/**
 * Choisit l'étape suivante, sans rien exécuter. On n'avance que si tout est prouvé :
 * un check requis absent ou en cours fait attendre, un check requis non réussi arrête tout.
 */
export function decideNextStep(situation: MergeSituation): NextStep {
  const { pullRequest } = situation;

  const blockingReason = findBlockingReason(pullRequest);
  if (blockingReason !== undefined) {
    return { kind: 'stop', reason: blockingReason };
  }
  // La protection de main exige une branche à jour : les checks d'une branche en retard ne
  // prouvent rien sur le commit qui sera fusionné.
  if (pullRequest.mergeStateStatus === 'BEHIND') {
    return { kind: 'update-branch' };
  }

  const requiredChecks = situation.requiredCheckNames.map((name) =>
    findCheck(situation.checks, name),
  );
  const unsuccessfulNames = namesWithBucket(requiredChecks, UNSUCCESSFUL_BUCKETS);
  if (unsuccessfulNames.length > 0) {
    return { kind: 'stop', reason: `Checks requis non réussis : ${unsuccessfulNames.join(', ')}` };
  }
  const pendingNames = namesWithBucket(requiredChecks, ['pending']);
  if (pendingNames.length > 0) {
    return { kind: 'wait', reason: `En attente des checks : ${pendingNames.join(', ')}` };
  }
  const withoutVerdictNames = namesWithBucket(requiredChecks, ['skipping']);
  if (withoutVerdictNames.length > 0) {
    const names = withoutVerdictNames.join(', ');
    return {
      kind: 'wait',
      reason: `En attente d’un verdict pour les checks neutres ou ignorés : ${names}`,
    };
  }

  if (pullRequest.mergeable === 'UNKNOWN') {
    return { kind: 'wait', reason: 'GitHub calcule si la PR est fusionnable' };
  }
  return { kind: 'merge', headCommit: pullRequest.headRefOid };
}

const UNSUCCESSFUL_BUCKETS: CheckBucket[] = ['fail', 'cancel'];

/*
 * Un check ignoré ou neutre compte comme réussi pour GitHub ; ici, on exige qu'il ait vraiment
 * réussi, sans s'arrêter pour autant. `gh pr checks` range le verdict NEUTRAL avec les checks
 * ignorés, et le résultat « CodeQL » du code scanning passe par ce verdict juste après une mise à
 * jour de la branche, avant le sien. On attend donc : un check qui resterait ignoré épuise le délai,
 * et rien n'est fusionné.
 */

function findBlockingReason(pullRequest: PullRequestState): string | undefined {
  const label = `La PR #${pullRequest.number}`;
  if (pullRequest.state !== 'OPEN') {
    return `${label} n’est pas ouverte (${pullRequest.state}).`;
  }
  if (pullRequest.isDraft) {
    return `${label} est un brouillon.`;
  }
  if (pullRequest.baseRefName !== 'main') {
    return `${label} vise ${pullRequest.baseRefName}, pas main.`;
  }
  if (pullRequest.mergeable === 'CONFLICTING') {
    return `${label} est en conflit avec main : résous-le, puis relance.`;
  }
  return undefined;
}

/** Un check requis que GitHub n'a pas encore créé est traité comme en cours. */
function findCheck(checks: CheckState[], name: string): CheckState {
  const check = checks.find((candidate) => candidate.name === name);
  if (check === undefined) {
    return { name, bucket: 'pending' };
  }
  return check;
}

function namesWithBucket(checks: CheckState[], buckets: CheckBucket[]): string[] {
  return checks.filter((check) => buckets.includes(check.bucket)).map((check) => check.name);
}
