import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/** Layout OCI refusé : le message nomme le défaut. */
export class OciLayoutError extends Error {}

const IMAGE_INDEX_TYPE = 'application/vnd.oci.image.index.v1+json';
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

const descriptorSchema = z.object({
  mediaType: z.string(),
  digest: z.string().regex(DIGEST_PATTERN),
  platform: z.object({ os: z.string(), architecture: z.string() }).optional(),
  annotations: z.record(z.string(), z.string()).optional(),
});

const indexSchema = z.object({ manifests: z.array(descriptorSchema) });

type Descriptor = z.infer<typeof descriptorSchema>;

/**
 * Rend le digest de l'index de l'image contenu dans un layout OCI produit par buildx.
 *
 * Le `index.json` d'un layout est un index enveloppe : son unique entrée est l'index de l'image,
 * qui référence le manifeste linux/amd64 et le manifeste d'attestation (SBOM et provenance).
 * C'est cet index de l'image qui est publié et signé : publier l'enveloppe ajouterait une
 * indirection et changerait le digest.
 */
export function imageIndexDigest(layoutDirectory: string): string {
  const wrapper = readWrapper(layoutDirectory);
  if (wrapper.manifests.length !== 1) {
    throw new OciLayoutError(
      `L’index enveloppe doit avoir exactement une entrée (${wrapper.manifests.length} trouvées).`,
    );
  }
  const entry = wrapper.manifests[0] as Descriptor;
  if (entry.mediaType !== IMAGE_INDEX_TYPE) {
    throw new OciLayoutError(
      `L’entrée du layout n’est pas un index d’image (${entry.mediaType}) : les attestations sont absentes.`,
    );
  }
  const imageIndex = parseIndex(readBlob(layoutDirectory, entry.digest));
  checkImageIndexContent(imageIndex.manifests);
  return entry.digest;
}

function readWrapper(layoutDirectory: string): z.infer<typeof indexSchema> {
  let text: string;
  try {
    text = readFileSync(join(layoutDirectory, 'index.json'), 'utf8');
  } catch {
    throw new OciLayoutError('Layout OCI sans index.json lisible.');
  }
  return parseIndex(text);
}

function parseIndex(text: string): z.infer<typeof indexSchema> {
  const parsed = indexSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new OciLayoutError('Index OCI de forme inattendue.');
  }
  return parsed.data;
}

/** Le contenu d'un blob est recalculé : un digest ne prouve rien s'il n'est pas vérifié. */
function readBlob(layoutDirectory: string, digest: string): string {
  const hex = digest.slice('sha256:'.length);
  const content = readFileSync(join(layoutDirectory, 'blobs', 'sha256', hex));
  const actualHex = createHash('sha256').update(content).digest('hex');
  if (actualHex !== hex) {
    throw new OciLayoutError(`Le blob ${digest} ne correspond pas à son digest.`);
  }
  return content.toString('utf8');
}

function checkImageIndexContent(manifests: Descriptor[]): void {
  const hasLinuxAmd64 = manifests.some(
    (manifest) => manifest.platform?.os === 'linux' && manifest.platform.architecture === 'amd64',
  );
  if (!hasLinuxAmd64) {
    throw new OciLayoutError('L’index de l’image n’a pas de manifeste linux/amd64.');
  }
  // buildx range le SBOM et la provenance dans un manifeste d'attestation, marqué ainsi.
  const hasAttestation = manifests.some(
    (manifest) => manifest.annotations?.['vnd.docker.reference.type'] === 'attestation-manifest',
  );
  if (!hasAttestation) {
    throw new OciLayoutError(
      'L’index de l’image n’a pas de manifeste d’attestation : SBOM et provenance absents.',
    );
  }
}
