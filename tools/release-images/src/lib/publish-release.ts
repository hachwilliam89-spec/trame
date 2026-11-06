import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CommandFailedError, type CommandRunner, runOrFail } from './command-runner';
import { imageIndexDigest } from './oci-layout';
import {
  IMAGE_REPOSITORY_PREFIX,
  type ImageName,
  RELEASE_ARTIFACT_TYPE,
  RELEASE_REPOSITORY,
} from './policy';
import { type ReleaseManifest, serializeReleaseManifest } from './release-manifest';
import { signerArguments, verifyPublishedRelease } from './verify-release';

export interface ScannedLayout {
  name: ImageName;
  /** Layout OCI téléchargé depuis le job de construction. */
  directory: string;
  /** Digest de l'index de l'image, relevé par le job qui l'a scanné. */
  scannedDigest: string;
}

export interface PublishOptions {
  run: CommandRunner;
  commit: string;
  layouts: ScannedLayout[];
  workingDirectory: string;
  isMainHead: (commit: string) => Promise<boolean>;
  report: (message: string) => void;
}

export type PublishOutcome =
  { published: true; manifest: ReleaseManifest } | { published: false; reason: string };

/** Publication arrêtée : le message nomme l'image et l'étape. */
export class PublicationError extends Error {}

interface PushedImage {
  name: ImageName;
  /** Référence immuable : `<dépôt>@<digest>`, ce qui est signé et déployé. */
  reference: string;
}

/**
 * Publie les six layouts scannés, sans les reconstruire, puis le manifeste de version.
 *
 * L'ordre protège le déploiement : les six images sont poussées, signées, vérifiées et
 * téléchargeables anonymement avant que le manifeste de version existe. Une panne en cours de
 * route laisse au pire des images sans manifeste, que B2 ne peut pas déployer.
 */
export async function publishRelease(options: PublishOptions): Promise<PublishOutcome> {
  const { commit } = options;
  // Le contrôle d'admissibilité a précédé les constructions : main a pu avancer depuis.
  if (!(await options.isMainHead(commit))) {
    return {
      published: false,
      reason: `main a avancé depuis le contrôle : ${commit} n’est plus la tête, rien n’est poussé.`,
    };
  }
  checkLayoutsAreTheScannedOnes(options.layouts);

  const images: PushedImage[] = [];
  for (const layout of options.layouts) {
    images.push(await pushLayout(options.run, layout, commit));
  }
  options.report('Six images poussées, digests identiques aux scans.');

  const anonymousConfig = writeAnonymousRegistryConfig(options.workingDirectory);
  for (const image of images) {
    await signAndVerify(options.run, image.reference, commit);
    await checkAnonymousAccess(options.run, image.reference, anonymousConfig, image.name);
  }
  options.report('Six images signées, vérifiées et publiques.');

  const manifest = await publishReleaseManifest(options, images, anonymousConfig);
  options.report(`Manifeste de version publié et vérifié pour ${commit}.`);
  return { published: true, manifest };
}

function checkLayoutsAreTheScannedOnes(layouts: ScannedLayout[]): void {
  for (const layout of layouts) {
    const digest = imageIndexDigest(layout.directory);
    if (digest !== layout.scannedDigest) {
      throw new PublicationError(
        `Le layout de ${layout.name} (${digest}) n’est pas celui qui a été scanné (${layout.scannedDigest}).`,
      );
    }
  }
}

async function pushLayout(
  run: CommandRunner,
  layout: ScannedLayout,
  commit: string,
): Promise<PushedImage> {
  const repository = `${IMAGE_REPOSITORY_PREFIX}${layout.name}`;
  const tagReference = `${repository}:${commit}`;
  // `oras cp` copie l'index désigné et tout ce qu'il référence : image et attestations.
  const source = `${layout.directory}@${layout.scannedDigest}`;
  await runOrFail(run, 'oras', ['cp', '--from-oci-layout', source, tagReference]);

  const publishedDigest = (await runOrFail(run, 'oras', ['resolve', tagReference])).trim();
  if (publishedDigest !== layout.scannedDigest) {
    throw new PublicationError(
      `Digest publié différent pour ${layout.name} : ${publishedDigest} au lieu de ${layout.scannedDigest}.`,
    );
  }
  return { name: layout.name, reference: `${repository}@${publishedDigest}` };
}

/**
 * Signature sans clé : cosign obtient le jeton OIDC du workflow. L'annotation lie le commit, et
 * la vérification immédiate applique la même politique que le déploiement.
 */
async function signAndVerify(run: CommandRunner, reference: string, commit: string): Promise<void> {
  await runOrFail(run, 'cosign', ['sign', '--yes', '-a', `commit=${commit}`, reference]);
  await runOrFail(run, 'cosign', ['verify', ...signerArguments(commit), reference]);
}

function writeAnonymousRegistryConfig(workingDirectory: string): string {
  const path = join(workingDirectory, 'anonymous-registry-config.json');
  writeFileSync(path, '{}');
  return path;
}

/** Un nouveau package GHCR est privé, même pour un dépôt public : on le vérifie sans identifiant. */
async function checkAnonymousAccess(
  run: CommandRunner,
  reference: string,
  anonymousConfig: string,
  subject: string,
): Promise<void> {
  const args = ['manifest', 'fetch', '--registry-config', anonymousConfig, reference];
  try {
    await runOrFail(run, 'oras', args);
  } catch (error) {
    if (!(error instanceof CommandFailedError)) {
      throw error;
    }
    const repository = reference.split('@')[0] ?? reference;
    throw new PublicationError(
      `Téléchargement anonyme impossible pour ${subject} : rends le package ${repository} public, puis relance le job échoué.`,
    );
  }
}

async function publishReleaseManifest(
  options: PublishOptions,
  images: PushedImage[],
  anonymousConfig: string,
): Promise<ReleaseManifest> {
  const { run, commit, workingDirectory } = options;
  const manifest: ReleaseManifest = { commit, images };
  writeFileSync(join(workingDirectory, 'images.json'), serializeReleaseManifest(manifest));

  const tagReference = `${RELEASE_REPOSITORY}:${commit}`;
  const pushArgs = [
    'push',
    tagReference,
    '--artifact-type',
    RELEASE_ARTIFACT_TYPE,
    'images.json:application/json',
  ];
  await runOrFail(run, 'oras', pushArgs, { workingDirectory });
  const releaseDigest = (await runOrFail(run, 'oras', ['resolve', tagReference])).trim();
  const releaseReference = `${RELEASE_REPOSITORY}@${releaseDigest}`;
  await signAndVerify(run, releaseReference, commit);

  await checkAnonymousAccess(run, releaseReference, anonymousConfig, 'le manifeste de version');
  // La vérification complète, telle que B2 la fera, conclut la publication.
  return verifyPublishedRelease({ run, expectedCommit: commit, workingDirectory });
}
