import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommandRunner } from './command-runner';
import { updateLocalCheckout } from './local-checkout';

/**
 * Vrai Git, dans des dossiers temporaires : un dépôt « origin » nu, un clone qui tient lieu de
 * poste du développeur, et un second clone qui simule la fusion faite par GitHub sur main.
 */
class GitSandbox {
  readonly root = mkdtempSync(join(tmpdir(), 'merge-pr-'));
  readonly origin = join(this.root, 'origin.git');
  readonly workstation = join(this.root, 'workstation');
  private readonly github = join(this.root, 'github');

  constructor() {
    this.git(this.root, 'init', '--quiet', '--bare', '--initial-branch=main', this.origin);
    this.git(this.root, 'clone', '--quiet', this.origin, this.github);
    this.commit(this.github, 'README.md', 'Trame\n', 'premier commit');
    this.git(this.github, 'push', '--quiet', 'origin', 'main');
    this.git(this.root, 'clone', '--quiet', this.origin, this.workstation);
  }

  /** Crée la branche de la PR sur le poste et la pousse ; rend son dernier commit. */
  pushFeatureBranch(branch: string): string {
    this.git(this.workstation, 'switch', '--quiet', '-c', branch);
    this.commit(this.workstation, 'feature.txt', 'nouveauté\n', 'feat: nouveauté');
    this.git(this.workstation, 'push', '--quiet', 'origin', branch);
    return this.headOf(this.workstation, 'HEAD');
  }

  /** Ce que fait GitHub en squash : un nouveau commit sur main, sans lien avec la branche. */
  squashMergeOnGitHub(): string {
    this.git(this.github, 'pull', '--quiet');
    this.commit(this.github, 'feature.txt', 'nouveauté\n', 'feat: nouveauté (#22)');
    this.git(this.github, 'push', '--quiet', 'origin', 'main');
    return this.headOf(this.github, 'HEAD');
  }

  commit(directory: string, file: string, content: string, message: string): void {
    writeFileSync(join(directory, file), content);
    this.git(directory, 'add', file);
    this.git(directory, 'commit', '--quiet', '-m', message);
  }

  git(directory: string, ...args: string[]): string {
    const identity = ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid'];
    // stderr capturé : les avertissements de Git (clone d'un dépôt vide) ne polluent pas la sortie.
    const output = execFileSync('git', [...identity, ...args], {
      cwd: directory,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return output.trim();
  }

  headOf(directory: string, ref: string): string {
    return this.git(directory, 'rev-parse', ref);
  }

  currentBranch(): string {
    return this.git(this.workstation, 'branch', '--show-current');
  }

  hasLocalBranch(branch: string): boolean {
    return this.git(this.workstation, 'branch', '--list', branch) !== '';
  }

  readWorkstationFile(file: string): string {
    return readFileSync(join(this.workstation, file), 'utf8');
  }

  remove(): void {
    rmSync(this.root, { recursive: true, force: true });
  }
}

const BRANCH = 'feat/US-020-oidc-api';

describe('updateLocalCheckout, avec un vrai Git', () => {
  let sandbox: GitSandbox;
  let messages: string[];

  beforeEach(() => {
    sandbox = new GitSandbox();
    messages = [];
  });

  afterEach(() => {
    sandbox.remove();
  });

  async function update(headCommit: string): Promise<void> {
    const run = createCommandRunner(sandbox.workstation);
    await updateLocalCheckout(run, { headRefName: BRANCH, headCommit }, (message) =>
      messages.push(message),
    );
  }

  it('passe sur main à jour et supprime la branche fusionnée quand le poste est propre', async () => {
    const featureHead = sandbox.pushFeatureBranch(BRANCH);
    const mergedMain = sandbox.squashMergeOnGitHub();

    await update(featureHead);

    expect(sandbox.currentBranch()).toBe('main');
    expect(sandbox.headOf(sandbox.workstation, 'main')).toBe(mergedMain);
    expect(sandbox.hasLocalBranch(BRANCH)).toBe(false);
  });

  it('garde la branche et ses modifications en cours, et met main à jour à côté', async () => {
    const featureHead = sandbox.pushFeatureBranch(BRANCH);
    const mergedMain = sandbox.squashMergeOnGitHub();
    writeFileSync(join(sandbox.workstation, 'feature.txt'), 'travail en cours\n');

    await update(featureHead);

    expect(sandbox.currentBranch()).toBe(BRANCH);
    expect(sandbox.readWorkstationFile('feature.txt')).toBe('travail en cours\n');
    expect(sandbox.headOf(sandbox.workstation, 'main')).toBe(mergedMain);
    expect(messages).toContain(
      `Modifications locales sur ${BRANCH} : conservées. Passe sur main quand elles seront rangées.`,
    );
  });

  it('garde la branche quand elle porte un commit qui n’a pas été fusionné', async () => {
    const featureHead = sandbox.pushFeatureBranch(BRANCH);
    sandbox.squashMergeOnGitHub();
    sandbox.commit(sandbox.workstation, 'later.txt', 'suite\n', 'feat: suite non poussée');

    await update(featureHead);

    expect(sandbox.currentBranch()).toBe('main');
    expect(sandbox.hasLocalBranch(BRANCH)).toBe(true);
    expect(messages).toContain(
      `${BRANCH} porte des commits non fusionnés : branche locale conservée.`,
    );
  });

  it('met main à jour sur place en gardant une modification en cours', async () => {
    const featureHead = sandbox.pushFeatureBranch(BRANCH);
    sandbox.git(sandbox.workstation, 'switch', '--quiet', 'main');
    const mergedMain = sandbox.squashMergeOnGitHub();
    writeFileSync(join(sandbox.workstation, 'README.md'), 'Trame, en cours\n');

    await update(featureHead);

    expect(sandbox.currentBranch()).toBe('main');
    expect(sandbox.headOf(sandbox.workstation, 'main')).toBe(mergedMain);
    expect(sandbox.readWorkstationFile('README.md')).toBe('Trame, en cours\n');
  });
});
