import { IMAGE_NAMES } from './policy';
import {
  ReleaseManifestError,
  parseReleaseManifest,
  serializeReleaseManifest,
} from './release-manifest';

const COMMIT = 'a'.repeat(40);
const OTHER_COMMIT = 'b'.repeat(40);

function digestFor(index: number): string {
  return `sha256:${String(index).repeat(64).slice(0, 64)}`;
}

function completeImages() {
  return IMAGE_NAMES.map((name, index) => ({
    name,
    reference: `ghcr.io/hachwilliam89-spec/trame-${name}@${digestFor(index + 1)}`,
  }));
}

function manifestText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ commit: COMMIT, images: completeImages(), ...overrides });
}

function refusal(text: string, expectedCommit = COMMIT): string {
  try {
    parseReleaseManifest(text, expectedCommit);
  } catch (error) {
    if (error instanceof ReleaseManifestError) {
      return error.message;
    }
    throw error;
  }
  throw new Error('images.json accepté à tort');
}

describe('parseReleaseManifest', () => {
  it('accepte les six images du commit attendu', () => {
    const manifest = parseReleaseManifest(manifestText(), COMMIT);

    expect(manifest.commit).toBe(COMMIT);
    expect(manifest.images.map((image) => image.name)).toEqual([...IMAGE_NAMES]);
  });

  it('relit ce que serializeReleaseManifest écrit', () => {
    const manifest = { commit: COMMIT, images: completeImages() };

    expect(parseReleaseManifest(serializeReleaseManifest(manifest), COMMIT)).toEqual(manifest);
  });

  it.each([
    ['', 'images.json est vide.'],
    ['   \n', 'images.json est vide.'],
    ['{ pas du json', 'images.json n’est pas un JSON valide.'],
    ['[]', 'images.json n’a pas la forme attendue : { commit, images: [{ name, reference }] }.'],
    [
      JSON.stringify({ commit: COMMIT }),
      'images.json n’a pas la forme attendue : { commit, images: [{ name, reference }] }.',
    ],
    [
      manifestText({ extra: true }),
      'images.json n’a pas la forme attendue : { commit, images: [{ name, reference }] }.',
    ],
  ])('refuse un fichier vide, illisible ou mal formé (%j)', (text, message) => {
    expect(refusal(text)).toBe(message);
  });

  it('refuse un commit différent du commit attendu', () => {
    expect(refusal(manifestText(), OTHER_COMMIT)).toBe(
      `images.json porte le commit ${COMMIT}, attendu ${OTHER_COMMIT}.`,
    );
  });

  it('refuse un commit qui n’est pas un SHA complet', () => {
    expect(refusal(manifestText({ commit: 'abc123' }), 'abc123')).toBe(
      'Commit mal formé : abc123 (40 caractères hexadécimaux attendus).',
    );
  });

  it('refuse une image manquante', () => {
    const images = completeImages().filter((image) => image.name !== 'worker');

    expect(refusal(manifestText({ images }))).toBe('Image manquante : worker.');
  });

  it('refuse un nom en double', () => {
    const images = [...completeImages(), completeImages()[0]];

    expect(refusal(manifestText({ images }))).toBe('Image en double : api.');
  });

  it('refuse un nom inconnu', () => {
    const images = [
      ...completeImages(),
      { name: 'debug', reference: `ghcr.io/hachwilliam89-spec/trame-debug@${digestFor(9)}` },
    ];

    expect(refusal(manifestText({ images }))).toBe('Image inconnue : debug.');
  });

  it.each([
    [`ghcr.io/attacker/trame-api@${digestFor(1)}`],
    [`ghcr.io/hachwilliam89-spec/trame-web@${digestFor(1)}`],
    [`docker.io/hachwilliam89-spec/trame-api@${digestFor(1)}`],
  ])('refuse un dépôt inattendu (%s)', (reference) => {
    const images = completeImages().map((image) =>
      image.name === 'api' ? { ...image, reference } : image,
    );

    expect(refusal(manifestText({ images }))).toBe(`Dépôt inattendu pour api : ${reference}.`);
  });

  it.each([
    ['ghcr.io/hachwilliam89-spec/trame-api:latest'],
    ['ghcr.io/hachwilliam89-spec/trame-api@sha256:abc'],
    [`ghcr.io/hachwilliam89-spec/trame-api@sha256:${'A'.repeat(64)}`],
    [`ghcr.io/hachwilliam89-spec/trame-api@sha512:${'a'.repeat(64)}`],
  ])('refuse un digest mal formé (%s)', (reference) => {
    const images = completeImages().map((image) =>
      image.name === 'api' ? { ...image, reference } : image,
    );

    expect(refusal(manifestText({ images }))).toBe(
      `Digest mal formé pour api : ${reference} (sha256 suivi de 64 caractères hexadécimaux attendu).`,
    );
  });
});
