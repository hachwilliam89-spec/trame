import type { CommandRunner } from './command-runner';
import type { MergedPullRequest } from './merge-pull-request';

/**
 * Met `main` à jour après la fusion, sans jamais toucher aux modifications locales.
 *
 * - Sur la branche fusionnée, poste propre : on passe sur main, puis on supprime la branche si
 *   elle ne porte rien d'autre que ce qui a été fusionné.
 * - Avec des modifications en cours : on reste où l'on est, main est avancée à côté.
 * Toute mise à jour de main se fait en avance rapide : Git refuse plutôt que de fusionner.
 */
export async function updateLocalCheckout(
  run: CommandRunner,
  merged: MergedPullRequest,
  report: (message: string) => void,
): Promise<void> {
  const git = gitCommand(run);
  const currentBranch = await git(['branch', '--show-current']);
  const hasLocalChanges = (await git(['status', '--porcelain'])) !== '';

  if (currentBranch === 'main') {
    await git(['pull', '--ff-only', '--quiet']);
    return;
  }
  if (currentBranch !== merged.headRefName || hasLocalChanges) {
    // Avance main sans changer de branche ni toucher aux fichiers de travail.
    await git(['fetch', '--quiet', 'origin', 'main:main']);
    reportKeptChanges(currentBranch, merged, hasLocalChanges, report);
    return;
  }

  await git(['switch', '--quiet', 'main']);
  await git(['pull', '--ff-only', '--quiet']);
  await deleteMergedBranch(git, merged, report);
}

type Git = (args: string[]) => Promise<string>;

function gitCommand(run: CommandRunner): Git {
  return async (args) => {
    const result = await run('git', args);
    if (result.exitCode !== 0) {
      throw new Error(`git ${args.join(' ')} a échoué : ${result.stderr.trim()}`);
    }
    return result.stdout.trim();
  };
}

function reportKeptChanges(
  currentBranch: string,
  merged: MergedPullRequest,
  hasLocalChanges: boolean,
  report: (message: string) => void,
): void {
  if (currentBranch === merged.headRefName && hasLocalChanges) {
    report(
      `Modifications locales sur ${currentBranch} : conservées. Passe sur main quand elles seront rangées.`,
    );
  }
}

/**
 * La fusion en squash crée un nouveau commit : Git ne voit pas la branche comme fusionnée et
 * `git branch -d` refuserait. On force la suppression seulement si la branche locale pointe
 * exactement sur le commit fusionné : aucun travail local ne peut alors être perdu.
 */
async function deleteMergedBranch(
  git: Git,
  merged: MergedPullRequest,
  report: (message: string) => void,
): Promise<void> {
  const localHead = await git(['rev-parse', `refs/heads/${merged.headRefName}`]);
  if (localHead !== merged.headCommit) {
    report(`${merged.headRefName} porte des commits non fusionnés : branche locale conservée.`);
    return;
  }
  await git(['branch', '--quiet', '-D', merged.headRefName]);
  report(`Branche locale ${merged.headRefName} supprimée.`);
}
