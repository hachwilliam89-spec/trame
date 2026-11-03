import {
  FakeGh,
  after,
  checksView,
  fails,
  pullRequestView,
  requiredChecksView,
  succeeds,
} from '../testing/fake-gh';
import { Deadline } from './deadline';
import { createGitHubCli } from './gh-cli';
import type { CheckState } from './merge-decision';
import {
  MergeOutcomeUnknownError,
  MergeStoppedError,
  mergePullRequest,
} from './merge-pull-request';

const REQUIRED_CHECKS = ['CI OK', 'Analyse (python)', 'CodeQL'];
const TEN_MINUTES = 10 * 60_000;
const PAUSE = 20_000;

function passing(names: string[] = REQUIRED_CHECKS): CheckState[] {
  return names.map((name) => ({ name, bucket: 'pass' }));
}

/** Lance la fusion avec un faux gh ; les pauses font avancer l'horloge simulée. */
function runMerge(fakeGh: FakeGh, budgetMilliseconds = TEN_MINUTES) {
  const deadline = new Deadline(fakeGh.stopwatch, budgetMilliseconds);
  const pauses: number[] = [];
  const result = mergePullRequest(createGitHubCli(fakeGh.run, deadline), {
    number: 22,
    deadline,
    pauseMilliseconds: PAUSE,
    pause: async (milliseconds) => {
      pauses.push(milliseconds);
      fakeGh.stopwatch.advance(milliseconds);
    },
    report: () => undefined,
  });
  return { result, pauses };
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

  it('abandonne sans fusionner quand le délai est dépassé, la dernière pause bornée au temps restant', async () => {
    const fakeGh = new FakeGh({
      api: [requiredChecksView(REQUIRED_CHECKS)],
      'pr view': [pullRequestView()],
      'pr checks': [checksView(passing(['CI OK', 'Analyse (python)']))],
    });

    const { result, pauses } = runMerge(fakeGh, 50_000);

    await expect(result).rejects.toThrow(
      new MergeStoppedError('Délai dépassé. Dernier état : En attente des checks : CodeQL'),
    );
    expect(pauses).toEqual([20_000, 20_000, 10_000]);
    expect(fakeGh.callsTo('pr checks')).toHaveLength(3);
    expect(fakeGh.callsTo('pr merge')).toEqual([]);
  });

  it('ne fusionne pas quand les lectures ont consommé tout le délai', async () => {
    const fakeGh = new FakeGh({
      api: [requiredChecksView(REQUIRED_CHECKS)],
      'pr view': [after(40_000, pullRequestView())],
      'pr checks': [after(40_000, checksView(passing()))],
      'pr merge': [succeeds()],
    });

    const { result } = runMerge(fakeGh, 60_000);

    await expect(result).rejects.toThrow(MergeStoppedError);
    expect(fakeGh.callsTo('pr merge')).toEqual([]);
    expect(fakeGh.stopwatch.elapsedMilliseconds()).toBe(60_000);
  });

  it('ne lance pas la fusion quand les lectures finissent pile à l’échéance', async () => {
    const fakeGh = new FakeGh({
      api: [requiredChecksView(REQUIRED_CHECKS)],
      'pr view': [after(30_000, pullRequestView())],
      'pr checks': [after(30_000, checksView(passing()))],
      'pr merge': [succeeds()],
    });

    const { result } = runMerge(fakeGh, 60_000);

    await expect(result).rejects.toThrow(
      new MergeStoppedError('Délai dépassé. Dernier état : gh pr merge non lancé'),
    );
    expect(fakeGh.callsTo('pr merge')).toEqual([]);
  });

  it('borne chaque commande gh au temps restant', async () => {
    const fakeGh = new FakeGh({
      api: [after(5_000, requiredChecksView(REQUIRED_CHECKS))],
      'pr view': [after(90_000, pullRequestView())],
    });

    const { result } = runMerge(fakeGh, 60_000);

    await expect(result).rejects.toThrow(
      new MergeStoppedError('Délai dépassé. Dernier état : gh pr view interrompu'),
    );
    expect(fakeGh.timeouts).toEqual([60_000, 55_000]);
    expect(fakeGh.stopwatch.elapsedMilliseconds()).toBe(60_000);
    expect(fakeGh.callsTo('pr checks')).toEqual([]);
  });

  it('signale un résultat incertain quand la fusion est interrompue par le délai', async () => {
    const fakeGh = new FakeGh({
      api: [requiredChecksView(REQUIRED_CHECKS)],
      'pr view': [pullRequestView()],
      'pr checks': [checksView(passing())],
      'pr merge': [after(90_000, succeeds())],
    });

    const { result } = runMerge(fakeGh, 60_000);

    await expect(result).rejects.toThrow(
      new MergeOutcomeUnknownError(
        'Délai atteint pendant la fusion : la PR #22 est peut-être fusionnée. Vérifie avec `gh pr view 22`.',
      ),
    );
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
