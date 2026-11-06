import { z } from 'zod';
import { IMAGE_NAMES, IMAGE_REPOSITORY_PREFIX, type ImageName } from './policy';

export interface ReleaseImage {
  name: ImageName;
  /** Référence immuable : `<dépôt>@sha256:<digest>`. */
  reference: string;
}

export interface ReleaseManifest {
  commit: string;
  images: ReleaseImage[];
}

/** images.json refusé : le message nomme le défaut. */
export class ReleaseManifestError extends Error {}

// Une liste plutôt qu'un objet indexé par nom : JSON.parse garderait en silence la dernière de
// deux clés identiques, alors qu'un nom en double doit être refusé.
const manifestShape = z
  .object({
    commit: z.string(),
    images: z.array(z.object({ name: z.string(), reference: z.string() }).strict()),
  })
  .strict();

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_SUFFIX_PATTERN = /^@sha256:[0-9a-f]{64}$/;

/**
 * Lit images.json et le refuse au moindre écart avec la politique : les six images, chacune une
 * fois, dans son dépôt, désignée par un digest sha256, pour le commit attendu.
 */
export function parseReleaseManifest(text: string, expectedCommit: string): ReleaseManifest {
  const candidate = manifestShape.safeParse(parseJson(text));
  if (!candidate.success) {
    throw new ReleaseManifestError(
      'images.json n’a pas la forme attendue : { commit, images: [{ name, reference }] }.',
    );
  }
  const { commit, images } = candidate.data;
  checkCommit(commit, expectedCommit);

  const seenNames = new Set<string>();
  const releaseImages: ReleaseImage[] = [];
  for (const image of images) {
    const name = checkName(image.name, seenNames);
    checkReference(name, image.reference);
    releaseImages.push({ name, reference: image.reference });
  }
  checkNoMissingImage(seenNames);
  return { commit, images: releaseImages };
}

export function serializeReleaseManifest(manifest: ReleaseManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function parseJson(text: string): unknown {
  if (text.trim() === '') {
    throw new ReleaseManifestError('images.json est vide.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ReleaseManifestError('images.json n’est pas un JSON valide.');
  }
}

function checkCommit(commit: string, expectedCommit: string): void {
  if (!COMMIT_PATTERN.test(commit)) {
    throw new ReleaseManifestError(
      `Commit mal formé : ${commit} (40 caractères hexadécimaux attendus).`,
    );
  }
  if (commit !== expectedCommit) {
    throw new ReleaseManifestError(
      `images.json porte le commit ${commit}, attendu ${expectedCommit}.`,
    );
  }
}

function checkName(name: string, seenNames: Set<string>): ImageName {
  if (!isImageName(name)) {
    throw new ReleaseManifestError(`Image inconnue : ${name}.`);
  }
  if (seenNames.has(name)) {
    throw new ReleaseManifestError(`Image en double : ${name}.`);
  }
  seenNames.add(name);
  return name;
}

function isImageName(name: string): name is ImageName {
  return (IMAGE_NAMES as readonly string[]).includes(name);
}

/** Le dépôt d'abord, puis le digest : `trame-api:latest` est bien le dépôt, mais pas un digest. */
function checkReference(name: ImageName, reference: string): void {
  const repository = `${IMAGE_REPOSITORY_PREFIX}${name}`;
  const isInRepository =
    reference.startsWith(`${repository}@`) || reference.startsWith(`${repository}:`);
  if (!isInRepository) {
    throw new ReleaseManifestError(`Dépôt inattendu pour ${name} : ${reference}.`);
  }
  const suffix = reference.slice(repository.length);
  if (!DIGEST_SUFFIX_PATTERN.test(suffix)) {
    throw new ReleaseManifestError(
      `Digest mal formé pour ${name} : ${reference} (sha256 suivi de 64 caractères hexadécimaux attendu).`,
    );
  }
}

function checkNoMissingImage(seenNames: Set<string>): void {
  for (const name of IMAGE_NAMES) {
    if (!seenNames.has(name)) {
      throw new ReleaseManifestError(`Image manquante : ${name}.`);
    }
  }
}
