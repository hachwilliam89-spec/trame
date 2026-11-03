import {
  FakeGh,
  checksView,
  fails,
  pullRequestView,
  requiredChecksView,
  succeeds,
} from '../testing/fake-gh';
import { createGitHubCli } from './gh-cli';
import type { CheckState } from './merge-decision';
import { MergeStoppedError, mergePullRequest } from './merge-pull-request';

const REQUIRED_CHECKS = ['CI OK', 'Analyse (python)', 'CodeQL'];

function passing(names: string[] = REQUIRED_CHECKS): CheckState[] {
  return names.map((name) => ({ name, bucket: 'pass' }));
}

function runMerge(fakeGh: FakeGh, maxAttempts = 5) {
  const messages: string[] = [];
  const result = mergePullRequest(createGitHubCli(fakeGh.run), {
    number: 22,
    maxAttempts,
    pauseBetweenAttempts: async () => undefined,
    report: (message) => messages.push(message),
  });
  return { result, messages };
}

describe('mergePullRequest, avec un faux gh', () => {
  it('attend que les checks soient créés puis réussis, et fusionne le commit vérifié', async () => {
    const fakeGh = new FakeGh({
      api: [requiredChecksView(REQUIRED_CHECKS)],
      'pr view': [pullRequestView()],
      'pr checks': [
        fails("no checks reported on the 'feat/US-020-oidc-api' branch"),
        checksView([{ name: 'CI OK', bucket: 'pending' }]),
        checksView(passing()),
      ],
      'pr merge': [succeeds()],
    });

    const { result } = runMerge(fakeGh);

    await expect(result).resolves.toEqual({
      headRefName: 'feat/US-020-oidc-api',
      headCommit: 'aaaa1111',
    });
    expect(fakeGh.callsTo('pr checks')).toHaveLength(3);
    expect(fakeGh.callsTo('pr merge')).toEqual([
      ['pr', 'merge', '22', '--squash', '--match-head-commit', 'aaaa1111'],
    ]);
  });

  it('met la branche à jour, puis fusionne le nouveau commit une fois ses checks réussis', async () => {
    const fakeGh = new FakeGh({
      api: [requiredChecksView(REQUIRED_CHECKS)],
      'pr view': [
        pullRequestView({ mergeStateStatus: 'BEHIND' }),
        pullRequestView({ headRefOid: 'bbbb2222', mergeStateStatus: 'BLOCKED' }),
        pullRequestView({ headRefOid: 'bbbb2222' }),
      ],
      'pr update-branch': [succeeds()],
      'pr checks': [
        checksView(passing()),
        checksView([{ name: 'CI OK', bucket: 'pending' }]),
        checksView(passing()),
      ],
      'pr merge': [succeeds()],
    });

    const { result } = runMerge(fakeGh);

    await expect(result).resolves.toMatchObject({ headCommit: 'bbbb2222' });
    expect(fakeGh.callsTo('pr update-branch')).toEqual([['pr', 'update-branch', '22']]);
    expect(fakeGh.callsTo('pr merge')).toEqual([
      ['pr', 'merge', '22', '--squash', '--match-head-commit', 'bbbb2222'],
    ]);
  });

  it('abandonne sans fusionner quand le délai est dépassé', async () => {
    const fakeGh = new FakeGh({
      api: [requiredChecksView(REQUIRED_CHECKS)],
      'pr view': [pullRequestView()],
      'pr checks': [checksView(passing(['CI OK', 'Analyse (python)']))],
    });

    const { result } = runMerge(fakeGh, 3);

    await expect(result).rejects.toThrow(
      new MergeStoppedError('Délai dépassé. Dernier état : En attente des checks : CodeQL'),
    );
    expect(fakeGh.callsTo('pr checks')).toHaveLength(3);
    expect(fakeGh.callsTo('pr merge')).toEqual([]);
  });

  it('s’arrête sans fusionner quand un check requis échoue', async () => {
    const fakeGh = new FakeGh({
      api: [requiredChecksView(REQUIRED_CHECKS)],
      'pr view': [pullRequestView()],
      'pr checks': [
        checksView([
          { name: 'CI OK', bucket: 'fail' },
          { name: 'Analyse (python)', bucket: 'pass' },
          { name: 'CodeQL', bucket: 'pass' },
        ]),
      ],
    });

    const { result } = runMerge(fakeGh);

    await expect(result).rejects.toThrow(
      new MergeStoppedError('Checks requis non réussis : CI OK'),
    );
    expect(fakeGh.callsTo('pr merge')).toEqual([]);
  });

  it('s’arrête sur un conflit, sans mettre à jour ni fusionner', async () => {
    const fakeGh = new FakeGh({
      api: [requiredChecksView(REQUIRED_CHECKS)],
      'pr view': [pullRequestView({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' })],
      'pr checks': [checksView(passing())],
    });

    const { result } = runMerge(fakeGh);

    await expect(result).rejects.toThrow(MergeStoppedError);
    expect(fakeGh.callsTo('pr update-branch')).toEqual([]);
    expect(fakeGh.callsTo('pr merge')).toEqual([]);
  });

  it('refuse de commencer si la protection de main n’exige plus CodeQL', async () => {
    const fakeGh = new FakeGh({
      api: [requiredChecksView(['CI OK', 'Analyse (python)'])],
    });

    const { result } = runMerge(fakeGh);

    await expect(result).rejects.toThrow(
      new MergeStoppedError('La protection de main n’exige pas : CodeQL. Fusion refusée.'),
    );
    expect(fakeGh.callsTo('pr view')).toEqual([]);
  });

  it('s’arrête quand GitHub refuse la fusion, sans réessayer ni forcer', async () => {
    const fakeGh = new FakeGh({
      api: [requiredChecksView(REQUIRED_CHECKS)],
      'pr view': [pullRequestView()],
      'pr checks': [checksView(passing())],
      'pr merge': [fails('Head branch was modified. Review and try the merge again.')],
    });

    const { result } = runMerge(fakeGh);

    await expect(result).rejects.toThrow(
      new MergeStoppedError(
        'GitHub a refusé la fusion : Head branch was modified. Review and try the merge again.',
      ),
    );
    expect(fakeGh.callsTo('pr merge')).toHaveLength(1);
    expect(fakeGh.calls.flat()).not.toContain('--admin');
  });

  it('s’arrête quand gh échoue pour une autre raison que l’absence de checks', async () => {
    const fakeGh = new FakeGh({
      api: [requiredChecksView(REQUIRED_CHECKS)],
      'pr view': [fails('HTTP 401: Bad credentials')],
    });

    const { result } = runMerge(fakeGh);

    await expect(result).rejects.toThrow('gh pr view a échoué : HTTP 401: Bad credentials');
    expect(fakeGh.callsTo('pr merge')).toEqual([]);
  });
});
