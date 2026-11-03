import { z } from 'zod';
import type { CommandResult, CommandRunner } from './command-runner';
import { type Deadline, DeadlineExceededError } from './deadline';
import type { CheckState, PullRequestState } from './merge-decision';

/** Ce que le script demande à GitHub, par la CLI `gh`. */
export interface GitHubCli {
  readPullRequest(number: number): Promise<PullRequestState>;
  readRequiredCheckNames(): Promise<string[]>;
  readChecks(number: number): Promise<CheckState[]>;
  updateBranch(number: number): Promise<void>;
  merge(number: number, headCommit: string): Promise<void>;
}

/** Une commande `gh` a échoué ; `detail` reprend son message d'erreur. */
export class GhCommandError extends Error {
  constructor(
    subcommand: string,
    readonly detail: string,
  ) {
    super(`gh ${subcommand} a échoué : ${detail}`);
  }
}

// Le format de `gh` peut changer d'une version à l'autre : on le vérifie plutôt que de le supposer.
const pullRequestSchema = z.object({
  number: z.number(),
  state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  isDraft: z.boolean(),
  baseRefName: z.string(),
  headRefName: z.string(),
  headRefOid: z.string(),
  mergeable: z.enum(['MERGEABLE', 'CONFLICTING', 'UNKNOWN']),
  mergeStateStatus: z.string(),
});

const checksSchema = z.array(
  z.object({
    name: z.string(),
    bucket: z.enum(['pass', 'fail', 'pending', 'skipping', 'cancel']),
  }),
);

const requiredCheckNamesSchema = z.array(z.string());

const PULL_REQUEST_FIELDS = Object.keys(pullRequestSchema.shape).join(',');

/** Message de `gh pr checks` quand GitHub n'a encore créé aucun check sur la PR. */
const NO_CHECKS_YET = /no (required )?checks reported/;

/** Chaque commande `gh` est bornée par le temps restant avant l'échéance, et n'est pas lancée après. */
export function createGitHubCli(run: CommandRunner, deadline: Deadline): GitHubCli {
  async function runGh(subcommand: string, args: string[]): Promise<CommandResult> {
    const remainingMilliseconds = deadline.remainingMilliseconds();
    if (remainingMilliseconds === 0) {
      throw new DeadlineExceededError(`gh ${subcommand} non lancé`, false);
    }
    const result = await run('gh', args, { timeoutMilliseconds: remainingMilliseconds });
    if (result.timedOut) {
      throw new DeadlineExceededError(`gh ${subcommand} interrompu`, true);
    }
    return result;
  }

  async function gh(subcommand: string, args: string[]): Promise<string> {
    const result = await runGh(subcommand, args);
    if (result.exitCode !== 0) {
      throw new GhCommandError(subcommand, errorDetail(result));
    }
    return result.stdout;
  }

  return {
    async readPullRequest(number) {
      const args = ['pr', 'view', String(number), '--json', PULL_REQUEST_FIELDS];
      return pullRequestSchema.parse(JSON.parse(await gh('pr view', args)));
    },

    async readRequiredCheckNames() {
      // `{owner}/{repo}` est remplacé par gh d'après le dépôt courant.
      const path = 'repos/{owner}/{repo}/branches/main/protection/required_status_checks';
      const output = await gh('api', ['api', path, '--jq', '.contexts']);
      return requiredCheckNamesSchema.parse(JSON.parse(output));
    },

    async readChecks(number) {
      const args = ['pr', 'checks', String(number), '--json', 'name,bucket'];
      const result = await runGh('pr checks', args);
      return parseChecks(result);
    },

    async updateBranch(number) {
      await gh('pr update-branch', ['pr', 'update-branch', String(number)]);
    },

    async merge(number, headCommit) {
      // --match-head-commit : GitHub refuse la fusion si un commit est arrivé depuis la vérification.
      // Jamais --admin : le script ne contourne pas la protection de main.
      const args = ['pr', 'merge', String(number), '--squash', '--match-head-commit', headCommit];
      await gh('pr merge', args);
    },
  };
}

/**
 * `gh pr checks` sort en 8 quand des checks sont en cours, en écrivant tout de même le JSON :
 * seul un JSON absent compte comme un échec, sauf si aucun check n'existe encore.
 */
function parseChecks(result: CommandResult): CheckState[] {
  if (result.stdout.trim() !== '') {
    return checksSchema.parse(JSON.parse(result.stdout));
  }
  if (NO_CHECKS_YET.test(result.stderr)) {
    return [];
  }
  throw new GhCommandError('pr checks', errorDetail(result));
}

function errorDetail(result: CommandResult): string {
  const detail = result.stderr.trim();
  if (detail === '') {
    return `code de sortie ${result.exitCode}`;
  }
  return detail;
}
