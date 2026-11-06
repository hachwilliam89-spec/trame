import { FakeReleaseTools } from '../testing/fake-release-tools';
import { IMAGE_NAMES, IMAGE_REPOSITORY_PREFIX, RELEASE_REPOSITORY } from './policy';
import { ReleaseManifestError, parseReleaseManifest } from './release-manifest';
import { signerArguments } from './verify-release';

/**
 * Le vérificateur shell (verify-release.sh), utilisé sur le VPS sans Node, applique la politique
 * du vérificateur TypeScript : mêmes arguments de confiance passés à cosign, mêmes refus du
 * manifeste, avec les mêmes messages (US-005 B2a, étape 3b, #47).
 */
const COMMIT = 'c'.repeat(40);
const OTHER_COMMIT = 'd'.repeat(40);
const RELEASE_DIGEST = `sha256:${'1'.repeat(64)}`;
const RELEASE_REFERENCE = `${RELEASE_REPOSITORY}@${RELEASE_DIGEST}`;

interface ManifestImage {
  name: string;
  reference: string;
}

function digestFor(index: number): string {
  return `sha256:${String(index).repeat(64)}`;
}

function completeImages(): ManifestImage[] {
  return IMAGE_NAMES.map((name, index) => ({
    name,
    reference: `${IMAGE_REPOSITORY_PREFIX}${name}@${digestFor(index + 3)}`,
  }));
}

function manifestText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ commit: COMMIT, images: completeImages(), ...overrides });
}

/** Le refus du vérificateur TypeScript pour ce manifeste : le shell doit dire la même chose. */
function typeScriptRefusal(text: string, expectedCommit: string): string {
  try {
    parseReleaseManifest(text, expectedCommit);
  } catch (error) {
    if (error instanceof ReleaseManifestError) {
      return error.message;
    }
    throw error;
  }
  throw new Error('Le vérificateur TypeScript accepte ce manifeste.');
}

describe('vérificateur shell de la version publiée (verify-release.sh)', () => {
  let tools: FakeReleaseTools;

  beforeEach(() => {
    tools = new FakeReleaseTools().resolvesTo(`${RELEASE_DIGEST}\n`).publishes(manifestText());
  });

  afterEach(() => {
    tools.dispose();
  });

  function cosignReferences(): string[] {
    const references: string[] = [];
    for (const call of tools.calls()) {
      if (call[0] === 'cosign') {
        references.push(call.at(-1) ?? '');
      }
    }
    return references;
  }

  it('vérifie le manifeste puis chaque image, avec les arguments de cosign du TypeScript', () => {
    const run = tools.verify(COMMIT);

    expect(run.exitCode).toBe(0);
    const expectedReferences = [
      RELEASE_REFERENCE,
      ...completeImages().map((image) => image.reference),
    ];
    const cosignCalls = tools.calls().filter((call) => call[0] === 'cosign');
    expect(cosignCalls).toEqual(
      expectedReferences.map((reference) => [
        'cosign',
        'verify',
        ...signerArguments(COMMIT),
        reference,
      ]),
    );
  });

  it('écrit les six digests, pour Compose, seulement une fois tout vérifié', () => {
    tools.verify(COMMIT);

    const expected = completeImages().map(
      (image) => `TRAME_${image.name.toUpperCase()}_DIGEST=${image.reference.split('@')[1]}`,
    );
    expect(tools.writtenDigests()).toBe(`${expected.join('\n')}\n`);
  });

  it('résout le tag une seule fois, puis télécharge le digest dont il a vérifié la signature', () => {
    tools.verify(COMMIT);

    const orasCalls = tools.calls().filter((call) => call[0] === 'oras');
    expect(orasCalls[0]).toEqual(['oras', 'resolve', `${RELEASE_REPOSITORY}:${COMMIT}`]);
    expect(orasCalls.filter((call) => call[1] === 'resolve')).toHaveLength(1);
    expect(orasCalls[1]?.slice(0, 2)).toEqual(['oras', 'pull']);
    expect(orasCalls[1]?.[2]).toBe(RELEASE_REFERENCE);
  });

  it('échoue quand le manifeste de version n’existe pas', () => {
    tools.failsToResolve('not found');

    const run = tools.verify(COMMIT);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain(`Manifeste de version introuvable pour ${COMMIT} : not found`);
    expect(tools.writtenDigests()).toBeUndefined();
  });

  it('échoue quand la résolution du tag ne rend pas un digest sha256', () => {
    tools.resolvesTo('sha256:abc\n');

    const run = tools.verify(COMMIT);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('Digest du manifeste de version mal formé : sha256:abc.');
  });

  it('ne télécharge pas un manifeste de version dont la signature est refusée', () => {
    tools.refusesSignatureOf(RELEASE_REFERENCE);

    const run = tools.verify(COMMIT);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('Signature refusée pour le manifeste de version');
    expect(tools.calls().some((call) => call[1] === 'pull')).toBe(false);
  });

  it('nomme l’image dont la signature est refusée, et n’écrit aucun digest', () => {
    const worker = completeImages().find((image) => image.name === 'worker');
    tools.refusesSignatureOf(worker?.reference ?? '');

    const run = tools.verify(COMMIT);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('Signature refusée pour worker');
    expect(tools.writtenDigests()).toBeUndefined();
  });

  it('refuse un manifeste signé pour un autre commit, avec le message du TypeScript', () => {
    const run = tools.verify(OTHER_COMMIT);

    expect(run.exitCode).toBe(1);
    expect(run.stderr.trim()).toBe(typeScriptRefusal(manifestText(), OTHER_COMMIT));
    expect(cosignReferences()).toEqual([RELEASE_REFERENCE]);
  });

  function withApi(reference: string): ManifestImage[] {
    return completeImages().map((image) =>
      image.name === 'api' ? { ...image, reference } : image,
    );
  }

  it.each([
    ['un fichier vide', ''],
    ['un fichier blanc', '   \n'],
    ['un JSON illisible', '{ pas du json'],
    ['une liste', '[]'],
    ['un manifeste sans images', JSON.stringify({ commit: COMMIT })],
    ['une clé en trop', manifestText({ extra: true })],
    ['un commit mal formé', manifestText({ commit: 'abc123' })],
    [
      'une image manquante',
      manifestText({ images: completeImages().filter((image) => image.name !== 'worker') }),
    ],
    ['une image en double', manifestText({ images: [...completeImages(), completeImages()[0]] })],
    [
      'une image inconnue',
      manifestText({
        images: [
          ...completeImages(),
          { name: 'debug', reference: `${IMAGE_REPOSITORY_PREFIX}debug@${digestFor(9)}` },
        ],
      }),
    ],
    [
      'un dépôt étranger',
      manifestText({ images: withApi(`ghcr.io/attacker/trame-api@${digestFor(1)}`) }),
    ],
    [
      'le dépôt d’une autre image',
      manifestText({ images: withApi(`${IMAGE_REPOSITORY_PREFIX}web@${digestFor(1)}`) }),
    ],
    [
      'un autre registre',
      manifestText({ images: withApi(`docker.io/hachwilliam89-spec/trame-api@${digestFor(1)}`) }),
    ],
    [
      'une étiquette au lieu d’un digest',
      manifestText({ images: withApi(`${IMAGE_REPOSITORY_PREFIX}api:latest`) }),
    ],
    [
      'un digest trop court',
      manifestText({ images: withApi(`${IMAGE_REPOSITORY_PREFIX}api@sha256:abc`) }),
    ],
    [
      'un digest en majuscules',
      manifestText({ images: withApi(`${IMAGE_REPOSITORY_PREFIX}api@sha256:${'A'.repeat(64)}`) }),
    ],
    [
      'un autre algorithme',
      manifestText({ images: withApi(`${IMAGE_REPOSITORY_PREFIX}api@sha512:${'a'.repeat(64)}`) }),
    ],
  ])('refuse %s, avec le message du vérificateur TypeScript', (_case, text) => {
    tools.publishes(text);

    const run = tools.verify(COMMIT);

    expect(run.exitCode).toBe(1);
    expect(run.stderr.trim()).toBe(typeScriptRefusal(text, COMMIT));
    expect(tools.writtenDigests()).toBeUndefined();
    // Aucune image n'est vérifiée tant que le manifeste n'est pas accepté.
    expect(cosignReferences()).toEqual([RELEASE_REFERENCE]);
  });

  it.each(['oras', 'cosign'] as const)(
    'dit que %s manque, plutôt que de refuser la version',
    (tool) => {
      tools.without(tool);

      const run = tools.verify(COMMIT);

      expect(run.exitCode).toBe(3);
      expect(run.stderr).toContain(`Vérification impossible : ${tool} introuvable`);
    },
  );

  it('refuse un commit qui n’est pas un SHA complet, sans rien interroger', () => {
    const run = tools.verify('abc123');

    expect(run.exitCode).toBe(2);
    expect(tools.calls()).toEqual([]);
  });
});
