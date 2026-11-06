import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LayoutBuilder, MANIFEST_TYPE } from '../testing/oci-layout-builder';
import { OciLayoutError, imageIndexDigest } from './oci-layout';

function refusal(directory: string): string {
  try {
    imageIndexDigest(directory);
  } catch (error) {
    if (error instanceof OciLayoutError) {
      return error.message;
    }
    throw error;
  }
  throw new Error('layout accepté à tort');
}

describe('imageIndexDigest', () => {
  let layout: LayoutBuilder;

  beforeEach(() => {
    layout = new LayoutBuilder();
  });

  afterEach(() => {
    layout.remove();
  });

  it('rend le digest de l’index de l’image, pas celui de l’index enveloppe', () => {
    const content = layout.standardImageIndex();
    const digest = layout.writeBlob(content);
    layout.writeWrapper([layout.entryFor(digest, content)]);

    expect(imageIndexDigest(layout.directory)).toBe(digest);
  });

  it('refuse un layout sans index.json', () => {
    expect(refusal(layout.directory)).toBe('Layout OCI sans index.json lisible.');
  });

  it('refuse un index enveloppe qui n’a pas exactement une entrée', () => {
    const content = layout.standardImageIndex();
    const digest = layout.writeBlob(content);
    layout.writeWrapper([layout.entryFor(digest, content), layout.entryFor(digest, content)]);

    expect(refusal(layout.directory)).toBe(
      'L’index enveloppe doit avoir exactement une entrée (2 trouvées).',
    );
  });

  it('refuse une entrée qui n’est pas un index d’image', () => {
    const content = layout.standardImageIndex();
    const digest = layout.writeBlob(content);
    layout.writeWrapper([layout.entryFor(digest, content, MANIFEST_TYPE)]);

    expect(refusal(layout.directory)).toBe(
      `L’entrée du layout n’est pas un index d’image (${MANIFEST_TYPE}) : les attestations sont absentes.`,
    );
  });

  it('refuse un blob dont le contenu ne correspond pas à son digest', () => {
    const content = layout.standardImageIndex();
    const digest = layout.writeBlob(content);
    writeFileSync(
      join(layout.directory, 'blobs', 'sha256', digest.slice('sha256:'.length)),
      `${content} `,
    );
    layout.writeWrapper([layout.entryFor(digest, content)]);

    expect(refusal(layout.directory)).toBe(`Le blob ${digest} ne correspond pas à son digest.`);
  });

  it('refuse un index d’image sans manifeste linux/amd64', () => {
    const content = layout.imageIndex([
      {
        mediaType: MANIFEST_TYPE,
        digest: `sha256:${'1'.repeat(64)}`,
        size: 1,
        platform: { os: 'linux', architecture: 'arm64' },
      },
    ]);
    const digest = layout.writeBlob(content);
    layout.writeWrapper([layout.entryFor(digest, content)]);

    expect(refusal(layout.directory)).toBe('L’index de l’image n’a pas de manifeste linux/amd64.');
  });

  it('refuse un index d’image sans manifeste d’attestation', () => {
    const content = layout.imageIndex([
      {
        mediaType: MANIFEST_TYPE,
        digest: `sha256:${'1'.repeat(64)}`,
        size: 1,
        platform: { os: 'linux', architecture: 'amd64' },
      },
    ]);
    const digest = layout.writeBlob(content);
    layout.writeWrapper([layout.entryFor(digest, content)]);

    expect(refusal(layout.directory)).toBe(
      'L’index de l’image n’a pas de manifeste d’attestation : SBOM et provenance absents.',
    );
  });
});
