import { FakeCommands, fails, succeeds } from '../testing/fake-commands';
import { createGitHubReader } from './github';

const COMMIT = 'e'.repeat(40);

function lines(...objects: object[]): string {
  return objects.map((object) => JSON.stringify(object)).join('\n') + '\n';
}

function apiPath(args: string[]): string {
  return args.find((arg) => arg.startsWith('repos/')) ?? '';
}

describe('createGitHubReader, avec un faux gh', () => {
  it('lit la tête de main', async () => {
    const commands = new FakeCommands().on('gh', 'api', () => succeeds(`${COMMIT}\n`));

    await expect(createGitHubReader(commands.run).mainHeadSha()).resolves.toBe(COMMIT);
    expect(commands.calls).toEqual([
      ['gh', 'api', 'repos/hachwilliam89-spec/trame/commits/main', '--jq', '.sha'],
    ]);
  });

  it('lit tous les checks du commit, pages comprises', async () => {
    const commands = new FakeCommands().on('gh', 'api', () =>
      succeeds(
        lines(
          { id: 1, name: 'CI OK', status: 'completed', conclusion: 'success' },
          { id: 2, name: 'Analyse (python)', status: 'in_progress', conclusion: null },
        ),
      ),
    );

    const runs = await createGitHubReader(commands.run).checkRuns(COMMIT);

    expect(runs).toEqual([
      { id: 1, name: 'CI OK', status: 'completed', conclusion: 'success' },
      { id: 2, name: 'Analyse (python)', status: 'in_progress', conclusion: null },
    ]);
    const call = commands.calls[0] ?? [];
    expect(call).toContain('--paginate');
    expect(apiPath(call)).toBe(
      `repos/hachwilliam89-spec/trame/commits/${COMMIT}/check-runs?per_page=100`,
    );
  });

  it('ne garde que les analyses de main portant sur ce commit', async () => {
    const commands = new FakeCommands().on('gh', 'api', () =>
      succeeds(
        lines(
          { category: '/language:python', commit_sha: COMMIT, error: '' },
          { category: '/language:python', commit_sha: 'f'.repeat(40), error: '' },
        ),
      ),
    );

    const analyses = await createGitHubReader(commands.run).codeScanningAnalyses(COMMIT);

    expect(analyses).toEqual([{ category: '/language:python', commitSha: COMMIT, error: '' }]);
    expect(apiPath(commands.calls[0] ?? [])).toBe(
      'repos/hachwilliam89-spec/trame/code-scanning/analyses?ref=refs/heads/main&per_page=100',
    );
  });

  it('lit les alertes ouvertes de main avec leur sévérité de sécurité', async () => {
    const commands = new FakeCommands().on('gh', 'api', () =>
      succeeds(
        lines(
          { number: 12, rule_id: 'js/xss', security_severity: 'high' },
          { number: 3, rule_id: 'js/todo', security_severity: null },
        ),
      ),
    );

    const alerts = await createGitHubReader(commands.run).openCodeScanningAlerts();

    expect(alerts).toEqual([
      { number: 12, ruleId: 'js/xss', securitySeverity: 'high' },
      { number: 3, ruleId: 'js/todo', securitySeverity: null },
    ]);
    const call = commands.calls[0] ?? [];
    expect(call).toContain('--paginate');
    expect(apiPath(call)).toBe(
      'repos/hachwilliam89-spec/trame/code-scanning/alerts?ref=refs/heads/main&state=open&per_page=100',
    );
  });

  it('échoue clairement quand gh échoue, plutôt que de conclure à l’absence d’alerte', async () => {
    const commands = new FakeCommands().on('gh', 'api', () =>
      fails('HTTP 403: Resource not accessible by integration'),
    );

    await expect(createGitHubReader(commands.run).openCodeScanningAlerts()).rejects.toThrow(
      'gh api a échoué : HTTP 403: Resource not accessible by integration',
    );
  });

  it('échoue sur une réponse de forme inattendue', async () => {
    const commands = new FakeCommands().on('gh', 'api', () => succeeds(lines({ number: 'douze' })));

    await expect(createGitHubReader(commands.run).openCodeScanningAlerts()).rejects.toThrow(
      'Réponse inattendue de gh api',
    );
  });
});
