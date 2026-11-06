import { FakeStopwatch } from '../testing/fake-stopwatch';
import { InMemoryGitHub } from '../testing/in-memory-github';
import { Deadline } from './deadline';
import { type RunContext, decidePublication, waitForPublicationDecision } from './publish-gate';

const COMMIT_A = 'a'.repeat(40);
const COMMIT_B = 'b'.repeat(40);
const REPOSITORY = 'hachwilliam89-spec/trame';

function pushContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    eventName: 'push',
    ref: 'refs/heads/main',
    sha: COMMIT_A,
    repository: REPOSITORY,
    ...overrides,
  };
}

function decide(
  context: RunContext,
  gitHub = new InMemoryGitHub(COMMIT_A),
  isAlreadyPublished = async () => false,
) {
  return decidePublication(context, { gitHub, isAlreadyPublished });
}

const MAIN_MOVED = `main a avancé : ${COMMIT_A} n’est plus la tête (${COMMIT_B}). Le commit le plus récent sera publié par ses propres runs.`;

describe('decidePublication', () => {
  it('publie la tête de main poussée quand la CI et les analyses ont réussi pour ce commit', async () => {
    await expect(decide(pushContext())).resolves.toEqual({ publish: true, commit: COMMIT_A });
  });

  it('publie la tête de main lancée à la main depuis main', async () => {
    await expect(decide(pushContext({ eventName: 'workflow_dispatch' }))).resolves.toEqual({
      publish: true,
      commit: COMMIT_A,
    });
  });

  it.each([
    [
      pushContext({ eventName: 'workflow_dispatch', ref: 'refs/heads/feat/x' }),
      'Run non admis : il doit partir de main (refs/heads/feat/x).',
    ],
    [
      pushContext({ ref: 'refs/heads/feat/x' }),
      'Run non admis : il doit partir de main (refs/heads/feat/x).',
    ],
    [
      pushContext({ eventName: 'pull_request' }),
      'Événement non admis pour publier : pull_request.',
    ],
    [pushContext({ repository: 'fork/trame' }), 'Dépôt non admis pour publier : fork/trame.'],
  ])('refuse un run non admissible (%#)', async (context, reason) => {
    await expect(decide(context)).resolves.toEqual({ publish: false, retryable: false, reason });
  });

  it('main avance pendant la CI du commit à publier : A n’est pas publié', async () => {
    const gitHub = new InMemoryGitHub(COMMIT_A);
    gitHub.mainHeads = [COMMIT_B];

    await expect(decide(pushContext(), gitHub)).resolves.toEqual({
      publish: false,
      retryable: false,
      reason: MAIN_MOVED,
    });
  });

  it('ancien commit corrigé depuis : A n’est pas publiable, même lancé à la main', async () => {
    // Un lancement manuel publie github.sha, la tête de main au lancement : jamais un ancien A.
    const gitHub = new InMemoryGitHub(COMMIT_A);
    gitHub.mainHeads = [COMMIT_B];
    gitHub.alerts = [];

    await expect(decide(pushContext({ eventName: 'workflow_dispatch' }), gitHub)).resolves.toEqual({
      publish: false,
      retryable: false,
      reason: MAIN_MOVED,
    });
  });

  it('attend un check exigé absent ou en cours', async () => {
    const gitHub = new InMemoryGitHub(COMMIT_A);
    gitHub.runs = gitHub.runs
      .filter((run) => run.name !== 'Analyse (python)')
      .map((run) =>
        run.name === 'CI OK' ? { ...run, status: 'in_progress', conclusion: null } : run,
      );

    await expect(decide(pushContext(), gitHub)).resolves.toEqual({
      publish: false,
      retryable: true,
      reason: 'En attente des checks : CI OK, Analyse (python).',
    });
  });

  it('refuse un check exigé non réussi', async () => {
    const gitHub = new InMemoryGitHub(COMMIT_A);
    gitHub.runs = gitHub.runs.map((run) =>
      run.name === 'Analyse (actions)' ? { ...run, conclusion: 'failure' } : run,
    );

    await expect(decide(pushContext(), gitHub)).resolves.toEqual({
      publish: false,
      retryable: false,
      reason: 'Checks non réussis : Analyse (actions) (failure).',
    });
  });

  it('retient le dernier essai d’un check relancé', async () => {
    const gitHub = new InMemoryGitHub(COMMIT_A);
    gitHub.runs = [
      { id: 100, name: 'CI OK', status: 'completed', conclusion: 'failure' },
      ...gitHub.runs.map((run) => (run.name === 'CI OK' ? { ...run, id: 200 } : run)),
    ];

    await expect(decide(pushContext(), gitHub)).resolves.toEqual({
      publish: true,
      commit: COMMIT_A,
    });
  });

  it('attend que chaque catégorie CodeQL ait une analyse traitée pour ce commit', async () => {
    const gitHub = new InMemoryGitHub(COMMIT_A);
    gitHub.analyses = gitHub.analyses.map((analysis) => {
      if (analysis.category === '/language:python') {
        return { ...analysis, commitSha: COMMIT_B };
      }
      if (analysis.category === '/language:actions') {
        return { ...analysis, error: 'SARIF invalide' };
      }
      return analysis;
    });

    await expect(decide(pushContext(), gitHub)).resolves.toEqual({
      publish: false,
      retryable: true,
      reason: 'Analyses CodeQL non traitées pour ce commit : /language:actions, /language:python.',
    });
  });

  it('refuse une alerte haute ou critique ouverte, pas une alerte moyenne', async () => {
    const gitHub = new InMemoryGitHub(COMMIT_A);
    gitHub.alerts = [
      { number: 3, ruleId: 'js/missing-rate-limiting', securitySeverity: 'medium' },
      { number: 12, ruleId: 'js/xss', securitySeverity: 'high' },
      { number: 14, ruleId: 'py/sql-injection', securitySeverity: 'critical' },
    ];

    await expect(decide(pushContext(), gitHub)).resolves.toEqual({
      publish: false,
      retryable: false,
      reason:
        'Alertes de code scanning hautes ou critiques ouvertes sur main : #12 js/xss, #14 py/sql-injection.',
    });
  });

  it('ne republie pas une version déjà publiée et vérifiée', async () => {
    await expect(
      decide(pushContext(), new InMemoryGitHub(COMMIT_A), async () => true),
    ).resolves.toEqual({
      publish: false,
      retryable: false,
      reason: `Version ${COMMIT_A} déjà publiée et vérifiée.`,
    });
  });

  it('refuse si main avance pendant le contrôle lui-même', async () => {
    const gitHub = new InMemoryGitHub(COMMIT_A);
    gitHub.mainHeads = [COMMIT_A, COMMIT_B];

    await expect(decide(pushContext(), gitHub)).resolves.toEqual({
      publish: false,
      retryable: false,
      reason: MAIN_MOVED,
    });
  });
});

describe('waitForPublicationDecision', () => {
  function waitWith(gitHub: InMemoryGitHub, budgetMilliseconds: number) {
    const stopwatch = new FakeStopwatch();
    const pauses: number[] = [];
    const result = waitForPublicationDecision(
      pushContext(),
      { gitHub, isAlreadyPublished: async () => false },
      {
        deadline: new Deadline(stopwatch, budgetMilliseconds),
        pauseMilliseconds: 30_000,
        pause: async (milliseconds) => {
          pauses.push(milliseconds);
          stopwatch.advance(milliseconds);
        },
        report: () => undefined,
      },
    );
    return { result, pauses };
  }

  it('attend la fin des checks, puis publie', async () => {
    const gitHub = new InMemoryGitHub(COMMIT_A);
    const finishedRuns = gitHub.runs;
    gitHub.runs = finishedRuns.map((run) => ({ ...run, status: 'in_progress', conclusion: null }));
    let readings = 0;
    gitHub.checkRuns = async () => {
      readings += 1;
      return readings < 3 ? gitHub.runs : finishedRuns;
    };

    const { result, pauses } = waitWith(gitHub, 10 * 60_000);

    await expect(result).resolves.toEqual({ publish: true, commit: COMMIT_A });
    expect(pauses).toEqual([30_000, 30_000]);
  });

  it('n’attend pas une décision définitive', async () => {
    const gitHub = new InMemoryGitHub(COMMIT_A);
    gitHub.mainHeads = [COMMIT_B];

    const { result, pauses } = waitWith(gitHub, 10 * 60_000);

    await expect(result).resolves.toMatchObject({ publish: false, retryable: false });
    expect(pauses).toEqual([]);
  });

  it('abandonne à l’échéance, la dernière pause bornée au temps restant', async () => {
    const gitHub = new InMemoryGitHub(COMMIT_A);
    gitHub.analyses = [];

    const { result, pauses } = waitWith(gitHub, 70_000);

    await expect(result).resolves.toEqual({
      publish: false,
      retryable: false,
      reason:
        'Délai dépassé. Dernier état : Analyses CodeQL non traitées pour ce commit : /language:actions, /language:javascript-typescript, /language:python.',
    });
    expect(pauses).toEqual([30_000, 30_000, 10_000]);
  });
});
