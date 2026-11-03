import {
  type CheckState,
  type PullRequestState,
  decideNextStep,
  missingMandatoryChecks,
} from './merge-decision';

const REQUIRED_CHECKS = ['CI OK', 'Analyse (python)', 'CodeQL'];

function openPullRequest(overrides: Partial<PullRequestState> = {}): PullRequestState {
  return {
    number: 22,
    state: 'OPEN',
    isDraft: false,
    baseRefName: 'main',
    headRefName: 'feat/US-020-oidc-api',
    headRefOid: 'aaaa1111',
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    ...overrides,
  };
}

function allPassing(): CheckState[] {
  return REQUIRED_CHECKS.map((name) => ({ name, bucket: 'pass' }));
}

describe('missingMandatoryChecks', () => {
  it('ne signale rien quand la protection exige CI OK et CodeQL', () => {
    expect(missingMandatoryChecks(REQUIRED_CHECKS)).toEqual([]);
  });

  it('signale CodeQL quand la protection ne l’exige plus', () => {
    expect(missingMandatoryChecks(['CI OK', 'Analyse (python)'])).toEqual(['CodeQL']);
  });
});

describe('decideNextStep', () => {
  it('fusionne le commit vérifié quand tous les checks requis passent', () => {
    const step = decideNextStep({
      pullRequest: openPullRequest(),
      requiredCheckNames: REQUIRED_CHECKS,
      checks: allPassing(),
    });

    expect(step).toEqual({ kind: 'merge', headCommit: 'aaaa1111' });
  });

  it('attend quand un check requis n’est pas encore créé', () => {
    const checksWithoutCodeQl = allPassing().filter((check) => check.name !== 'CodeQL');

    const step = decideNextStep({
      pullRequest: openPullRequest(),
      requiredCheckNames: REQUIRED_CHECKS,
      checks: checksWithoutCodeQl,
    });

    expect(step).toEqual({ kind: 'wait', reason: 'En attente des checks : CodeQL' });
  });

  it('attend quand un check requis est en cours', () => {
    const checks: CheckState[] = [
      { name: 'CI OK', bucket: 'pending' },
      { name: 'Analyse (python)', bucket: 'pass' },
      { name: 'CodeQL', bucket: 'pass' },
    ];

    const step = decideNextStep({
      pullRequest: openPullRequest(),
      requiredCheckNames: REQUIRED_CHECKS,
      checks,
    });

    expect(step).toEqual({ kind: 'wait', reason: 'En attente des checks : CI OK' });
  });

  it('s’arrête quand un check requis échoue, est annulé ou ignoré', () => {
    const checks: CheckState[] = [
      { name: 'CI OK', bucket: 'fail' },
      { name: 'Analyse (python)', bucket: 'cancel' },
      { name: 'CodeQL', bucket: 'skipping' },
    ];

    const step = decideNextStep({
      pullRequest: openPullRequest(),
      requiredCheckNames: REQUIRED_CHECKS,
      checks,
    });

    expect(step).toEqual({
      kind: 'stop',
      reason: 'Checks requis non réussis : CI OK, Analyse (python), CodeQL',
    });
  });

  it('ignore l’échec d’un check qui n’est pas requis', () => {
    const checks: CheckState[] = [...allPassing(), { name: 'Revue optionnelle', bucket: 'fail' }];

    const step = decideNextStep({
      pullRequest: openPullRequest(),
      requiredCheckNames: REQUIRED_CHECKS,
      checks,
    });

    expect(step.kind).toBe('merge');
  });

  it('met la branche à jour quand elle est en retard sur main', () => {
    const step = decideNextStep({
      pullRequest: openPullRequest({ mergeStateStatus: 'BEHIND' }),
      requiredCheckNames: REQUIRED_CHECKS,
      checks: allPassing(),
    });

    expect(step).toEqual({ kind: 'update-branch' });
  });

  it('s’arrête sur un conflit, même si les checks passent', () => {
    const step = decideNextStep({
      pullRequest: openPullRequest({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }),
      requiredCheckNames: REQUIRED_CHECKS,
      checks: allPassing(),
    });

    expect(step).toEqual({
      kind: 'stop',
      reason: 'La PR #22 est en conflit avec main : résous-le, puis relance.',
    });
  });

  it('attend tant que GitHub n’a pas calculé si la PR est fusionnable', () => {
    const step = decideNextStep({
      pullRequest: openPullRequest({ mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' }),
      requiredCheckNames: REQUIRED_CHECKS,
      checks: allPassing(),
    });

    expect(step).toEqual({ kind: 'wait', reason: 'GitHub calcule si la PR est fusionnable' });
  });

  it.each([
    [{ state: 'MERGED' as const }, 'La PR #22 n’est pas ouverte (MERGED).'],
    [{ state: 'CLOSED' as const }, 'La PR #22 n’est pas ouverte (CLOSED).'],
    [{ isDraft: true }, 'La PR #22 est un brouillon.'],
    [{ baseRefName: 'develop' }, 'La PR #22 vise develop, pas main.'],
  ])('s’arrête sur une PR qu’on ne doit pas fusionner (%o)', (overrides, reason) => {
    const step = decideNextStep({
      pullRequest: openPullRequest(overrides),
      requiredCheckNames: REQUIRED_CHECKS,
      checks: allPassing(),
    });

    expect(step).toEqual({ kind: 'stop', reason });
  });
});
