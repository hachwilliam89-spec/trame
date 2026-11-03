/**
 * Fusionne une PR en squash, une fois prouvé que son dernier commit a passé tous les checks
 * requis par la protection de main, puis met `main` à jour sur le poste.
 *
 * Usage : pnpm pr:merge <numéro de PR> [--timeout <minutes>]
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArguments } from './lib/arguments';
import { createCommandRunner } from './lib/command-runner';
import { Deadline } from './lib/deadline';
import { createGitHubCli } from './lib/gh-cli';
import { updateLocalCheckout } from './lib/local-checkout';
import {
  MergeOutcomeUnknownError,
  MergeStoppedError,
  mergePullRequest,
} from './lib/merge-pull-request';
import { createSystemStopwatch } from './lib/system-stopwatch';

const MILLISECONDS_BETWEEN_ATTEMPTS = 20_000;

function report(message: string): void {
  console.log(`pr:merge · ${message}`);
}

async function main(): Promise<void> {
  const { number, timeoutMinutes } = parseArguments(process.argv.slice(2));
  const run = createCommandRunner(process.cwd());
  const deadline = new Deadline(createSystemStopwatch(), timeoutMinutes * 60_000);

  const merged = await mergePullRequest(createGitHubCli(run, deadline), {
    number,
    deadline,
    pauseMilliseconds: MILLISECONDS_BETWEEN_ATTEMPTS,
    pause: (milliseconds) => sleep(milliseconds),
    report,
  });
  report(`PR #${number} fusionnée (commit ${merged.headCommit.slice(0, 7)}).`);

  try {
    await updateLocalCheckout(run, merged, report);
  } catch (error) {
    // La fusion est faite : seule la mise à jour du poste reste à reprendre à la main.
    throw new Error(`PR fusionnée, mais main n'a pas pu être mise à jour : ${String(error)}`);
  }
}

main().catch((error: unknown) => {
  if (error instanceof MergeStoppedError) {
    report(`arrêt, rien n'a été fusionné. ${error.message}`);
  } else if (error instanceof MergeOutcomeUnknownError) {
    report(`arrêt, résultat incertain. ${error.message}`);
  } else {
    report(String(error));
  }
  process.exitCode = 1;
});
