import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const IMAGE_INDEX_TYPE = 'application/vnd.oci.image.index.v1+json';
export const MANIFEST_TYPE = 'application/vnd.oci.image.manifest.v1+json';

/**
 * Layout OCI tel que l'écrit buildx avec attestations : un index enveloppe (index.json) dont
 * l'unique entrée est l'index de l'image, qui référence le manifeste linux/amd64 et le manifeste
 * d'attestation (SBOM et provenance).
 */
export class LayoutBuilder {
  readonly directory = mkdtempSync(join(tmpdir(), 'layout-'));

  writeBlob(content: string): string {
    const hex = createHash('sha256').update(content).digest('hex');
    mkdirSync(join(this.directory, 'blobs', 'sha256'), { recursive: true });
    writeFileSync(join(this.directory, 'blobs', 'sha256', hex), content);
    return `sha256:${hex}`;
  }

  imageIndex(manifests: object[]): string {
    return JSON.stringify({ schemaVersion: 2, mediaType: IMAGE_INDEX_TYPE, manifests });
  }

  standardImageIndex(): string {
    return this.imageIndex([
      {
        mediaType: MANIFEST_TYPE,
        digest: `sha256:${'1'.repeat(64)}`,
        size: 1,
        platform: { os: 'linux', architecture: 'amd64' },
      },
      {
        mediaType: MANIFEST_TYPE,
        digest: `sha256:${'2'.repeat(64)}`,
        size: 1,
        platform: { os: 'unknown', architecture: 'unknown' },
        annotations: {
          'vnd.docker.reference.type': 'attestation-manifest',
          'vnd.docker.reference.digest': `sha256:${'1'.repeat(64)}`,
        },
      },
    ]);
  }

  writeWrapper(entries: object[]): void {
    writeFileSync(
      join(this.directory, 'oci-layout'),
      JSON.stringify({ imageLayoutVersion: '1.0.0' }),
    );
    writeFileSync(
      join(this.directory, 'index.json'),
      JSON.stringify({ schemaVersion: 2, mediaType: IMAGE_INDEX_TYPE, manifests: entries }),
    );
  }

  entryFor(digest: string, content: string, mediaType = IMAGE_INDEX_TYPE): object {
    return { mediaType, digest, size: Buffer.byteLength(content) };
  }

  remove(): void {
    rmSync(this.directory, { recursive: true, force: true });
  }
}

/** Un layout complet, comme buildx l'écrit ; rend son dossier et le digest de l'index de l'image. */
export function writeStandardLayout(): { layout: LayoutBuilder; digest: string } {
  const layout = new LayoutBuilder();
  const content = layout.standardImageIndex();
  const digest = layout.writeBlob(content);
  layout.writeWrapper([layout.entryFor(digest, content)]);
  return { layout, digest };
}
