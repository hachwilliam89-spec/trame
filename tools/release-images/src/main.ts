/**
 * Publication des images (US-005 B1, issue #44), appelée par `.github/workflows/publish-images.yml`.
 *
 * Usage :
 *   release-images gate                                  contrôle d'admissibilité (GitHub Actions)
 *   release-images layout-digest <layout>                digest de l'index de l'image d'un layout
 *   release-images publish <commit> <dossier des layouts> publication, signature, manifeste de version
 *   release-images verify <commit>                       vérification d'une version publiée (B2)
 */
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createCommandRunner, createDeadlineRunner } from './lib/command-runner';
import { createGitHubReader } from './lib/github';
import { imageIndexDigest } from './lib/oci-layout';
import { IMAGE_NAMES } from './lib/policy';
import { Deadline } from './lib/deadline';
import { waitForPublicationDecision } from './lib/publish-gate';
import { type ScannedLayout, publishRelease } from './lib/publish-release';
import { readRunContext } from './lib/run-context';
import { createSystemStopwatch } from './lib/system-stopwatch';
import { isReleaseComplete, verifyPublishedRelease } from './lib/verify-release';

/** La CI et CodeQL tournent en parallèle du gate ; la CI dure une vingtaine de minutes. */
const GATE_BUDGET_MILLISECONDS = 60 * 60_000;
const GATE_PAUSE_MILLISECONDS = 30_000;

const USAGE =
  'Usage : release-images gate | layout-digest <layout> | publish <commit> <layouts> | verify <commit>';

function report(message: string): void {
  console.log(`release-images · ${message}`);
}

function freshDirectory(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Écrit une sortie d'étape GitHub Actions, et la note dans le résumé du job. */
function writeStepOutputs(outputs: Record<string, string>): void {
  const outputPath = process.env['GITHUB_OUTPUT'];
  if (outputPath === undefined) {
    return;
  }
  for (const [name, value] of Object.entries(outputs)) {
    appendFileSync(outputPath, `${name}=${value}\n`);
  }
}

function writeSummary(text: string): void {
  const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryPath !== undefined) {
    appendFileSync(summaryPath, `${text}\n`);
  }
}

async function gate(): Promise<void> {
  const context = readRunContext(process.env);
  // Une seule échéance pour l'attente, les pauses et chaque commande gh, oras ou cosign.
  const deadline = new Deadline(createSystemStopwatch(), GATE_BUDGET_MILLISECONDS);
  const run = createDeadlineRunner(createCommandRunner(), deadline);
  const dependencies = {
    gitHub: createGitHubReader(run),
    isAlreadyPublished: (commit: string) =>
      isReleaseComplete({
        run,
        expectedCommit: commit,
        workingDirectory: freshDirectory('release-'),
      }),
  };
  const decision = await waitForPublicationDecision(context, dependencies, {
    deadline,
    pauseMilliseconds: GATE_PAUSE_MILLISECONDS,
    pause: (milliseconds) => sleep(milliseconds),
    report,
  });
  if (decision.publish) {
    report(`publication admise pour ${decision.commit}.`);
    writeStepOutputs({ publish: 'true', commit: decision.commit });
    writeSummary(`Publication admise pour \`${decision.commit}\`.`);
    return;
  }
  report(`pas de publication. ${decision.reason}`);
  writeStepOutputs({ publish: 'false', commit: context.sha });
  writeSummary(`Pas de publication : ${decision.reason}`);
}

function layoutDigest(layoutDirectory: string): void {
  console.log(imageIndexDigest(layoutDirectory));
}

/** Le job de construction dépose `<nom>/` (le layout) et `<nom>.scanned-digest` par image. */
function readScannedLayouts(layoutsDirectory: string): ScannedLayout[] {
  return IMAGE_NAMES.map((name) => ({
    name,
    directory: join(layoutsDirectory, name),
    scannedDigest: readFileSync(join(layoutsDirectory, `${name}.scanned-digest`), 'utf8').trim(),
  }));
}

async function publish(commit: string, layoutsDirectory: string): Promise<void> {
  const run = createCommandRunner();
  const gitHub = createGitHubReader(run);
  const outcome = await publishRelease({
    run,
    commit,
    layouts: readScannedLayouts(layoutsDirectory),
    workingDirectory: freshDirectory('publish-'),
    isMainHead: async (candidate) => (await gitHub.mainHeadSha()) === candidate,
    report,
  });
  if (!outcome.published) {
    report(`pas de publication. ${outcome.reason}`);
    writeSummary(`Pas de publication : ${outcome.reason}`);
    return;
  }
  for (const image of outcome.manifest.images) {
    writeSummary(`- \`${image.name}\` : \`${image.reference}\``);
  }
}

async function verify(commit: string): Promise<void> {
  const manifest = await verifyPublishedRelease({
    run: createCommandRunner(),
    expectedCommit: commit,
    workingDirectory: freshDirectory('release-'),
  });
  report(`version ${commit} vérifiée : ${manifest.images.length} images signées.`);
  console.log(JSON.stringify(manifest, null, 2));
}

async function main(args: string[]): Promise<void> {
  const [command, first, second] = args;
  if (command === 'gate') {
    return gate();
  }
  if (command === 'layout-digest' && first !== undefined) {
    return layoutDigest(first);
  }
  if (command === 'publish' && first !== undefined && second !== undefined) {
    return publish(first, second);
  }
  if (command === 'verify' && first !== undefined) {
    return verify(first);
  }
  throw new Error(USAGE);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  report(`échec. ${message}`);
  process.exitCode = 1;
});
