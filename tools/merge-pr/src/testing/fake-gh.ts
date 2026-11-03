import type { CommandResult, CommandRunner } from '../lib/command-runner';
import type { CheckState, PullRequestState } from '../lib/merge-decision';

/** Sous-commandes de `gh` utilisées par le script, repérées par leurs deux premiers arguments. */
type GhSubcommand = 'pr view' | 'pr checks' | 'pr update-branch' | 'pr merge' | 'api';

type ScriptedResponses = Partial<Record<GhSubcommand, CommandResult[]>>;

/**
 * Faux `gh` : chaque sous-commande rend ses réponses dans l'ordre, puis répète la dernière.
 * Il enregistre chaque appel, pour vérifier par exemple qu'aucune fusion réelle n'est demandée
 * avec `--admin`.
 */
export class FakeGh {
  readonly calls: string[][] = [];

  constructor(private readonly responses: ScriptedResponses) {}

  readonly run: CommandRunner = async (command, args) => {
    if (command !== 'gh') {
      throw new Error(`Commande inattendue : ${command}`);
    }
    this.calls.push(args);
    return this.nextResponse(subcommandOf(args));
  };

  callsTo(subcommand: GhSubcommand): string[][] {
    return this.calls.filter((args) => subcommandOf(args) === subcommand);
  }

  private nextResponse(subcommand: GhSubcommand): CommandResult {
    const queue = this.responses[subcommand];
    if (queue === undefined || queue.length === 0) {
      throw new Error(`Aucune réponse prévue pour gh ${subcommand}`);
    }
    if (queue.length > 1) {
      return queue.shift() as CommandResult;
    }
    return queue[0] as CommandResult;
  }
}

function subcommandOf(args: string[]): GhSubcommand {
  if (args[0] === 'api') {
    return 'api';
  }
  return `${args[0]} ${args[1]}` as GhSubcommand;
}

export function succeeds(stdout = ''): CommandResult {
  return { exitCode: 0, stdout, stderr: '' };
}

export function fails(stderr: string, exitCode = 1): CommandResult {
  return { exitCode, stdout: '', stderr };
}

export function pullRequestView(overrides: Partial<PullRequestState> = {}): CommandResult {
  const pullRequest: PullRequestState = {
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
  return succeeds(JSON.stringify(pullRequest));
}

/** `gh pr checks` sort en 8 tant qu'un check est en cours, en écrivant quand même le JSON. */
export function checksView(checks: CheckState[]): CommandResult {
  const isPending = checks.some((check) => check.bucket === 'pending');
  const exitCode = isPending ? 8 : 0;
  return { exitCode, stdout: JSON.stringify(checks), stderr: '' };
}

export function requiredChecksView(names: string[]): CommandResult {
  return succeeds(JSON.stringify(names));
}
