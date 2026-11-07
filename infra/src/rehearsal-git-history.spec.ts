import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitMainHistory } from './lib/rehearsal/git-main-history';

/**
 * L'historique de main que lit la répétition, dans un vrai clone : le choix par défaut ne parcourt
 * que les derniers commits, mais une version demandée est reconnue à toute profondeur.
 */
const RECENT_LIMIT = 60;
const GIT_ENVIRONMENT = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Trame',
  GIT_AUTHOR_EMAIL: 'trame@example.invalid',
  GIT_COMMITTER_NAME: 'Trame',
  GIT_COMMITTER_EMAIL: 'trame@example.invalid',
};

function git(directory: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: directory,
    env: GIT_ENVIRONMENT,
    encoding: 'utf8',
  }).trim();
}

describe('historique de main lu par la répétition', () => {
  const directory = mkdtempSync(join(tmpdir(), 'historique-main-'));
  const origin = join(directory, 'origin');
  const clone = join(directory, 'clone');
  const commits: string[] = [];
  let history: GitMainHistory;

  beforeAll(() => {
    git(directory, 'init', '--quiet', '--initial-branch', 'main', origin);
    for (let index = 0; index < RECENT_LIMIT + 1; index += 1) {
      git(origin, 'commit', '--quiet', '--allow-empty', '--message', `commit ${String(index)}`);
      commits.unshift(git(origin, 'rev-parse', 'HEAD'));
    }
    git(directory, 'clone', '--quiet', origin, clone);
    history = new GitMainHistory(clone, RECENT_LIMIT, GIT_ENVIRONMENT);
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('parcourt par défaut les seuls derniers commits, du plus récent au plus ancien', async () => {
    expect(await history.recent()).toEqual(commits.slice(0, RECENT_LIMIT));
  });

  it('reconnaît un commit de main au-delà de ces derniers commits', async () => {
    const oldest = commits.at(-1) ?? '';

    expect(await history.contains(oldest)).toBe(true);
    expect(await history.precedes(oldest, commits[0] ?? '')).toBe(true);
  });

  it('ne reconnaît ni un commit inconnu, ni un ordre inversé, ni un commit qui se précède', async () => {
    const newest = commits[0] ?? '';
    const oldest = commits.at(-1) ?? '';

    expect(await history.contains('f'.repeat(40))).toBe(false);
    expect(await history.precedes(newest, oldest)).toBe(false);
    expect(await history.precedes(newest, newest)).toBe(false);
  });

  it('donne les commits qui précèdent une version, du plus récent au plus ancien', async () => {
    const before = await history.before(commits[2] ?? '');

    expect(before.slice(0, 2)).toEqual(commits.slice(3, 5));
  });
});
