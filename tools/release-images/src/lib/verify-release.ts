import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CommandFailedError,
  type CommandRunner,
  MissingCommandError,
  runOrFail,
} from './command-runner';
import { GITHUB_REPOSITORY, OIDC_ISSUER, RELEASE_REPOSITORY, SIGNER_IDENTITY } from './policy';
import {
  type ReleaseManifest,
  ReleaseManifestError,
  parseReleaseManifest,
} from './release-manifest';

export interface VerifyReleaseOptions {
  run: CommandRunner;
  expectedCommit: string;
  /** Dossier de travail où le manifeste de version est téléchargé. */
  workingDirectory: string;
}

/** Version refusée : le message nomme l'image ou le manifeste en cause. */
export class ReleaseVerificationError extends Error {}

/** Vérification impossible faute d'outil : ni un refus, ni une publication incomplète. */
export class VerificationUnavailableError extends Error {}

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * Vérifie la version publiée pour un commit : le manifeste de version signé, puis chacune des
 * six images qu'il désigne. Tout est signé par le workflow de publication, sur main, pour ce
 * commit précis : une signature valide d'une ancienne version est refusée.
 */
export async function verifyPublishedRelease(
  options: VerifyReleaseOptions,
): Promise<ReleaseManifest> {
  const { run, expectedCommit } = options;

  // Le tag est résolu une seule fois : la signature est vérifiée sur ce digest, puis ce même
  // digest est téléchargé. Relire le tag laisserait le temps de le faire pointer ailleurs.
  const releaseDigest = await resolveReleaseDigest(run, expectedCommit);
  const releaseReference = `${RELEASE_REPOSITORY}@${releaseDigest}`;
  await verifySignature(run, releaseReference, expectedCommit, 'le manifeste de version');

  const manifestText = await pullReleaseManifest(run, releaseReference, options.workingDirectory);
  const manifest = parseReleaseManifest(manifestText, expectedCommit);
  for (const image of manifest.images) {
    await verifySignature(run, image.reference, expectedCommit, image.name);
  }
  return manifest;
}

async function resolveReleaseDigest(run: CommandRunner, commit: string): Promise<string> {
  const tagReference = `${RELEASE_REPOSITORY}:${commit}`;
  let output: string;
  try {
    output = await runOrFail(run, 'oras', ['resolve', tagReference]);
  } catch (error) {
    throw new ReleaseVerificationError(
      `Manifeste de version introuvable pour ${commit} : ${messageOf(error)}`,
    );
  }
  const digest = output.trim();
  if (!DIGEST_PATTERN.test(digest)) {
    throw new ReleaseVerificationError(`Digest du manifeste de version mal formé : ${digest}.`);
  }
  return digest;
}

/** Arguments de confiance de cosign : ils viennent de la politique, jamais du fichier vérifié. */
export function signerArguments(commit: string): string[] {
  return [
    '--certificate-identity',
    SIGNER_IDENTITY,
    '--certificate-oidc-issuer',
    OIDC_ISSUER,
    '--certificate-github-workflow-repository',
    GITHUB_REPOSITORY,
    '--certificate-github-workflow-ref',
    'refs/heads/main',
    '--certificate-github-workflow-sha',
    commit,
    '-a',
    `commit=${commit}`,
  ];
}

async function verifySignature(
  run: CommandRunner,
  reference: string,
  commit: string,
  subject: string,
): Promise<void> {
  try {
    await runOrFail(run, 'cosign', ['verify', ...signerArguments(commit), reference]);
  } catch (error) {
    throw new ReleaseVerificationError(`Signature refusée pour ${subject} : ${messageOf(error)}`);
  }
}

async function pullReleaseManifest(
  run: CommandRunner,
  releaseReference: string,
  workingDirectory: string,
): Promise<string> {
  await runOrFail(run, 'oras', ['pull', releaseReference, '-o', workingDirectory]);
  return readFileSync(join(workingDirectory, 'images.json'), 'utf8');
}

/**
 * Un outil absent n'est pas un manifeste introuvable ni une signature refusée : on le dit, pour
 * que l'on installe l'outil plutôt que de chercher une publication manquante.
 */
function messageOf(error: unknown): string {
  if (error instanceof MissingCommandError) {
    throw new VerificationUnavailableError(
      `Vérification impossible : ${error.message}. Installer oras et cosign (voir infra/docker/README.md).`,
    );
  }
  if (error instanceof CommandFailedError) {
    return error.message;
  }
  throw error;
}

/**
 * Une publication n'est terminée que si sa version vérifiée existe : des images présentes sans
 * manifeste de version signé ne comptent pas, et la publication est alors refaite entièrement.
 */
export async function isReleaseComplete(options: VerifyReleaseOptions): Promise<boolean> {
  try {
    await verifyPublishedRelease(options);
    return true;
  } catch (error) {
    if (error instanceof ReleaseVerificationError || error instanceof ReleaseManifestError) {
      return false;
    }
    throw error;
  }
}
