import { runCommand } from './command';
import type { MainHistory } from './rehearsed-versions';

const MAIN = 'origin/main';

/**
 * L'historique de main dans un clone du dépôt. Seul le choix par défaut se limite aux derniers
 * commits ; l'appartenance à main et l'ordre de deux versions sont vérifiés à toute profondeur.
 */
export class GitMainHistory implements MainHistory {
  constructor(
    private readonly clone: string,
    private readonly recentLimit: number,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  recent(): Promise<string[]> {
    return this.firstParentLog(MAIN, 0);
  }

  before(commit: string): Promise<string[]> {
    return this.firstParentLog(commit, 1);
  }

  contains(commit: string): Promise<boolean> {
    return this.isAncestor(commit, MAIN);
  }

  async precedes(older: string, newer: string): Promise<boolean> {
    if (older === newer) {
      return false;
    }
    return this.isAncestor(older, newer);
  }

  private async firstParentLog(start: string, skip: number): Promise<string[]> {
    const output = await this.git(
      'log',
      '--first-parent',
      '--format=%H',
      `--skip=${String(skip)}`,
      '-n',
      String(this.recentLimit),
      start,
    );
    return output.split('\n').filter((commit) => commit !== '');
  }

  /** `git merge-base --is-ancestor` : 0 oui, 1 non ; un commit inconnu compte pour non. */
  private async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
    try {
      await this.git('merge-base', '--is-ancestor', ancestor, descendant);
      return true;
    } catch {
      return false;
    }
  }

  private git(...args: string[]): Promise<string> {
    return runCommand('git', ['-C', this.clone, ...args], { environment: this.environment });
  }
}
