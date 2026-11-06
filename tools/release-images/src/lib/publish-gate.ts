import { type Deadline, DeadlineExceededError } from './deadline';
import type { CheckRun, GitHubReader } from './github';
import {
  BLOCKING_ALERT_SEVERITIES,
  CODE_SCANNING_CATEGORIES,
  GITHUB_REPOSITORY,
  REQUIRED_CHECKS,
} from './policy';

/** Contexte du run, lu dans les variables de GitHub Actions. */
export interface RunContext {
  eventName: string;
  ref: string;
  /** `github.sha` : le commit poussé, et le `sha` du jeton OIDC qui signera. */
  sha: string;
  repository: string;
}

/**
 * `retryable` : la réponse peut changer en attendant (checks ou analyses en cours). Sinon, la
 * décision est définitive pour ce run.
 */
export type GateDecision =
  { publish: true; commit: string } | { publish: false; retryable: boolean; reason: string };

export interface GateDependencies {
  gitHub: GitHubReader;
  isAlreadyPublished: (commit: string) => Promise<boolean>;
}

interface Refusal {
  retryable: boolean;
  reason: string;
}

/**
 * Décide si ce run publie, et quel commit. Seule la tête de main est publiée : c'est le commit
 * du jeton OIDC qui signera, et les résultats de sécurité sont lus pour ce commit précis.
 */
export async function decidePublication(
  context: RunContext,
  dependencies: GateDependencies,
): Promise<GateDecision> {
  const commit = context.sha;
  const findRefusals = [
    async () => final(triggerRefusal(context)),
    async () => final(await headRefusal(dependencies.gitHub, commit)),
    () => checksRefusal(dependencies.gitHub, commit),
    async () => retryable(await analysesRefusal(dependencies.gitHub, commit)),
    async () => final(await alertsRefusal(dependencies.gitHub)),
    async () => final(await alreadyPublishedRefusal(dependencies, commit)),
    // main a pu avancer pendant ces lectures : on revérifie juste avant de répondre.
    async () => final(await headRefusal(dependencies.gitHub, commit)),
  ];
  for (const findRefusal of findRefusals) {
    const refusal = await findRefusal();
    if (refusal !== undefined) {
      return { publish: false, ...refusal };
    }
  }
  return { publish: true, commit };
}

function final(reason: string | undefined): Refusal | undefined {
  return reason === undefined ? undefined : { retryable: false, reason };
}

function retryable(reason: string | undefined): Refusal | undefined {
  return reason === undefined ? undefined : { retryable: true, reason };
}

function triggerRefusal(context: RunContext): string | undefined {
  if (context.repository !== GITHUB_REPOSITORY) {
    return `Dépôt non admis pour publier : ${context.repository}.`;
  }
  if (context.eventName !== 'push' && context.eventName !== 'workflow_dispatch') {
    return `Événement non admis pour publier : ${context.eventName}.`;
  }
  if (context.ref !== 'refs/heads/main') {
    return `Run non admis : il doit partir de main (${context.ref}).`;
  }
  return undefined;
}

async function headRefusal(gitHub: GitHubReader, commit: string): Promise<string | undefined> {
  const head = await gitHub.mainHeadSha();
  if (head !== commit) {
    return mainMovedReason(commit, head);
  }
  return undefined;
}

function mainMovedReason(commit: string, head: string): string {
  return `main a avancé : ${commit} n’est plus la tête (${head}). Le commit le plus récent sera publié par ses propres runs.`;
}

async function checksRefusal(gitHub: GitHubReader, commit: string): Promise<Refusal | undefined> {
  const runs = await gitHub.checkRuns(commit);
  const pendingNames: string[] = [];
  const failedNames: string[] = [];
  for (const name of REQUIRED_CHECKS) {
    const latest = latestRun(runs, name);
    if (latest === undefined || latest.status !== 'completed') {
      pendingNames.push(name);
    } else if (latest.conclusion !== 'success') {
      failedNames.push(`${name} (${latest.conclusion ?? 'sans conclusion'})`);
    }
  }
  if (failedNames.length > 0) {
    return { retryable: false, reason: `Checks non réussis : ${failedNames.join(', ')}.` };
  }
  if (pendingNames.length > 0) {
    return { retryable: true, reason: `En attente des checks : ${pendingNames.join(', ')}.` };
  }
  return undefined;
}

/** Un check relancé garde ses anciens essais : seul le plus récent compte. */
function latestRun(runs: CheckRun[], name: string): CheckRun | undefined {
  let latest: CheckRun | undefined;
  for (const run of runs) {
    if (run.name === name && (latest === undefined || run.id > latest.id)) {
      latest = run;
    }
  }
  return latest;
}

async function analysesRefusal(gitHub: GitHubReader, commit: string): Promise<string | undefined> {
  const analyses = await gitHub.codeScanningAnalyses(commit);
  const missingCategories = CODE_SCANNING_CATEGORIES.filter((category) => {
    const isProcessed = analyses.some(
      (analysis) =>
        analysis.category === category && analysis.commitSha === commit && analysis.error === '',
    );
    return !isProcessed;
  });
  if (missingCategories.length > 0) {
    return `Analyses CodeQL non traitées pour ce commit : ${missingCategories.join(', ')}.`;
  }
  return undefined;
}

async function alertsRefusal(gitHub: GitHubReader): Promise<string | undefined> {
  const alerts = await gitHub.openCodeScanningAlerts();
  const blockingAlerts = alerts.filter((alert) =>
    BLOCKING_ALERT_SEVERITIES.includes(alert.securitySeverity ?? ''),
  );
  if (blockingAlerts.length > 0) {
    const labels = blockingAlerts.map((alert) => `#${alert.number} ${alert.ruleId}`);
    return `Alertes de code scanning hautes ou critiques ouvertes sur main : ${labels.join(', ')}.`;
  }
  return undefined;
}

async function alreadyPublishedRefusal(
  dependencies: GateDependencies,
  commit: string,
): Promise<string | undefined> {
  if (await dependencies.isAlreadyPublished(commit)) {
    return `Version ${commit} déjà publiée et vérifiée.`;
  }
  return undefined;
}

export interface WaitOptions {
  deadline: Deadline;
  pauseMilliseconds: number;
  pause: (milliseconds: number) => Promise<void>;
  report: (message: string) => void;
}

/**
 * Le gate démarre au push, avant la fin de la CI et de CodeQL : il attend ces résultats, jusqu'à
 * une échéance mesurée. L'échéance est vérifiée avant chaque lecture et avant d'autoriser la
 * publication : une lecture lente ne peut pas faire publier après le délai.
 */
export async function waitForPublicationDecision(
  context: RunContext,
  dependencies: GateDependencies,
  options: WaitOptions,
): Promise<GateDecision> {
  const { deadline } = options;
  let lastReason: string | undefined;
  for (;;) {
    if (deadline.isExpired()) {
      return expiredDecision(lastReason);
    }
    const decision = await decideBeforeDeadline(context, dependencies);
    if (!decision.publish && !decision.retryable) {
      return decision;
    }
    if (deadline.isExpired()) {
      return expiredDecision(decision.publish ? undefined : decision.reason);
    }
    if (decision.publish) {
      return decision;
    }
    lastReason = decision.reason;
    options.report(decision.reason);
    await options.pause(Math.min(options.pauseMilliseconds, deadline.remainingMilliseconds()));
  }
}

/** Une commande arrêtée par l'échéance (non lancée ou interrompue) refuse la publication. */
async function decideBeforeDeadline(
  context: RunContext,
  dependencies: GateDependencies,
): Promise<GateDecision> {
  try {
    return await decidePublication(context, dependencies);
  } catch (error) {
    if (error instanceof DeadlineExceededError) {
      return { publish: false, retryable: false, reason: `Délai dépassé : ${error.message}.` };
    }
    throw error;
  }
}

function expiredDecision(lastReason: string | undefined): GateDecision {
  if (lastReason === undefined) {
    return {
      publish: false,
      retryable: false,
      reason: 'Délai dépassé : le contrôle a atteint son échéance avant de conclure.',
    };
  }
  return {
    publish: false,
    retryable: false,
    reason: `Délai dépassé. Dernier état : ${lastReason}`,
  };
}
