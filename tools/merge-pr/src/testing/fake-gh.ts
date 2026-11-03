import type { CommandResult, CommandRunner } from '../lib/command-runner';
import type { CheckState, PullRequestState } from '../lib/merge-decision';
import { FakeStopwatch } from './fake-stopwatch';

/** Sous-commandes de `gh` utilisées par le script, repérées par leurs deux premiers arguments. */
type GhSubcommand = 'pr view' | 'pr checks' | 'pr update-branch' | 'pr merge' | 'api';

/** Réponse prévue, et le temps que la commande met à la rendre (0 par défaut). */
interface ScriptedResponse extends CommandResult {
  durationMilliseconds?: number;
}

type ScriptedResponses = Partial<Record<GhSubcommand, ScriptedResponse[]>>;

/**
 * Faux `gh` : chaque sous-commande rend ses réponses dans l'ordre, puis répète la dernière.
 * Il enregistre chaque appel, pour vérifier par exemple qu'aucune fusion réelle n'est demandée
 * avec `--admin`.
 *
 * Chaque réponse fait avancer l'horloge simulée de sa durée. Une commande plus longue que la
 * durée maximale reçue est interrompue à cette durée, comme le ferait le vrai lanceur.
 */
export class FakeGh {
  readonly calls: string[][] = [];
  /** Durée maximale reçue par chaque appel, dans l'ordre des appels. */
  readonly timeouts: (number | undefined)[] = [];

  constructor(
    private readonly responses: ScriptedResponses,
    readonly stopwatch = new FakeStopwatch(),
  ) {}

  readonly run: CommandRunner = async (command, args, options) => {
    if (command !== 'gh') {
      throw new Error(`Commande inattendue : ${command}`);
    }
    this.calls.push(args);
    this.timeouts.push(options?.timeoutMilliseconds);
    const response = this.nextResponse(subcommandOf(args));
    return this.consumeTime(response, options?.timeoutMilliseconds);
  };

  callsTo(subcommand: GhSubcommand): string[][] {
    return this.calls.filter((args) => subcommandOf(args) === subcommand);
  }

  private consumeTime(response: ScriptedResponse, timeoutMilliseconds?: number): CommandResult {
    const duration = response.durationMilliseconds ?? 0;
    if (timeoutMilliseconds !== undefined && duration > timeoutMilliseconds) {
      this.stopwatch.advance(timeoutMilliseconds);
      return { exitCode: 1, stdout: '', stderr: '', timedOut: true };
    }
    this.stopwatch.advance(duration);
    const { exitCode, stdout, stderr, timedOut } = response;
    return { exitCode, stdout, stderr, timedOut };
  }

  private nextResponse(subcommand: GhSubcommand): ScriptedResponse {
    const queue = this.responses[subcommand];
    if (queue === undefined || queue.length === 0) {
      throw new Error(`Aucune réponse prévue pour gh ${subcommand}`);
    }
    if (queue.length > 1) {
      return queue.shift() as ScriptedResponse;
    }
    return queue[0] as ScriptedResponse;
  }
}

function subcommandOf(args: string[]): GhSubcommand {
  if (args[0] === 'api') {
    return 'api';
  }
  return `${args[0]} ${args[1]}` as GhSubcommand;
}

export function succeeds(stdout = ''): CommandResult {
  return { exitCode: 0, stdout, stderr: '', timedOut: false };
}

export function fails(stderr: string, exitCode = 1): CommandResult {
  return { exitCode, stdout: '', stderr, timedOut: false };
}

/** La même réponse, rendue après `durationMilliseconds` sur l'horloge simulée. */
export function after(durationMilliseconds: number, response: CommandResult): ScriptedResponse {
  return { ...response, durationMilliseconds };
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
  return { exitCode, stdout: JSON.stringify(checks), stderr: '', timedOut: false };
}

export function requiredChecksView(names: string[]): CommandResult {
  return succeeds(JSON.stringify(names));
}
