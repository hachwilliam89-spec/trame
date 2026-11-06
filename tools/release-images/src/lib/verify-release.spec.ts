import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeCommands, fails, succeeds } from '../testing/fake-commands';
import { IMAGE_NAMES } from './policy';
import { ReleaseManifestError } from './release-manifest';
import {
  ReleaseVerificationError,
  VerificationUnavailableError,
  isReleaseComplete,
  verifyPublishedRelease,
} from './verify-release';

const COMMIT = 'c'.repeat(40);
const OTHER_COMMIT = 'd'.repeat(40);
const RELEASE_DIGEST = `sha256:${'1'.repeat(64)}`;
const RELEASE = 'ghcr.io/hachwilliam89-spec/trame-release';

function imageReference(name: string, index: number): string {
  return `ghcr.io/hachwilliam89-spec/trame-${name}@sha256:${String(index).repeat(64)}`;
}

function manifestFor(commit: string): string {
  const images = IMAGE_NAMES.map((name, index) => ({
    name,
    reference: imageReference(name, index + 3),
  }));
  return JSON.stringify({ commit, images });
}

/** `oras pull <référence> -o <dossier>` : écrit images.json dans le dossier demandé. */
function writesManifest(contentFor: (reference: string) => string) {
  return (args: string[]) => {
    const reference = args[1] ?? '';
    const outputDirectory = args[args.indexOf('-o') + 1] ?? '';
    writeFileSync(join(outputDirectory, 'images.json'), contentFor(reference));
    return succeeds();
  };
}

function trustedCommands(): FakeCommands {
  return new FakeCommands()
    .on('oras', 'resolve', () => succeeds(`${RELEASE_DIGEST}\n`))
    .on(
      'oras',
      'pull',
      writesManifest(() => manifestFor(COMMIT)),
    )
    .on('cosign', 'verify', () => succeeds('[]'));
}

const EXPECTED_SIGNER_FLAGS = [
  '--certificate-identity',
  'https://github.com/hachwilliam89-spec/trame/.github/workflows/publish-images.yml@refs/heads/main',
  '--certificate-oidc-issuer',
  'https://token.actions.githubusercontent.com',
  '--certificate-github-workflow-repository',
  'hachwilliam89-spec/trame',
  '--certificate-github-workflow-ref',
  'refs/heads/main',
  '--certificate-github-workflow-sha',
  COMMIT,
  '-a',
  `commit=${COMMIT}`,
];

describe('verifyPublishedRelease, avec de faux cosign et oras', () => {
  let workingDirectory: string;

  beforeEach(() => {
    workingDirectory = mkdtempSync(join(tmpdir(), 'release-'));
  });

  afterEach(() => {
    rmSync(workingDirectory, { recursive: true, force: true });
  });

  function verify(commands: FakeCommands) {
    return verifyPublishedRelease({ run: commands.run, expectedCommit: COMMIT, workingDirectory });
  }

  it('vérifie le manifeste de version, puis la signature de chacune des six images', async () => {
    const commands = trustedCommands();

    const manifest = await verify(commands);

    expect(manifest.commit).toBe(COMMIT);
    const verifiedReferences = commands.callsTo('cosign', 'verify').map((call) => call.at(-1));
    expect(verifiedReferences).toEqual([
      `${RELEASE}@${RELEASE_DIGEST}`,
      ...IMAGE_NAMES.map((name, index) => imageReference(name, index + 3)),
    ]);
    for (const call of commands.callsTo('cosign', 'verify')) {
      expect(call.slice(2, -1)).toEqual(EXPECTED_SIGNER_FLAGS);
    }
  });

  it('vérifie puis télécharge le même digest, même si le tag est remplacé entre-temps', async () => {
    const commands = trustedCommands()
      .on('oras', 'resolve', () => succeeds(`${RELEASE_DIGEST}\n`))
      .on(
        'oras',
        'pull',
        writesManifest((reference) => {
          if (reference === `${RELEASE}@${RELEASE_DIGEST}`) {
            return manifestFor(COMMIT);
          }
          // Le tag pointe désormais vers un autre manifeste, signé pour un autre commit.
          return manifestFor(OTHER_COMMIT);
        }),
      );

    await expect(verify(commands)).resolves.toMatchObject({ commit: COMMIT });

    expect(commands.callsTo('oras', 'resolve')).toEqual([
      ['oras', 'resolve', `${RELEASE}:${COMMIT}`],
    ]);
    expect(commands.callsTo('oras', 'pull').map((call) => call[2])).toEqual([
      `${RELEASE}@${RELEASE_DIGEST}`,
    ]);
    expect(commands.callsTo('cosign', 'verify')[0]?.at(-1)).toBe(`${RELEASE}@${RELEASE_DIGEST}`);
  });

  it('échoue quand le manifeste de version n’existe pas', async () => {
    const commands = trustedCommands().on('oras', 'resolve', () => fails('not found'));

    await expect(verify(commands)).rejects.toThrow(
      new ReleaseVerificationError(
        `Manifeste de version introuvable pour ${COMMIT} : oras resolve a échoué : not found`,
      ),
    );
  });

  it('dit qu’oras manque, plutôt que d’annoncer un manifeste introuvable', async () => {
    const commands = trustedCommands().on('oras', 'resolve', () =>
      fails('commande introuvable : oras (absente du PATH)'),
    );

    await expect(verify(commands)).rejects.toThrow(
      new VerificationUnavailableError(
        'Vérification impossible : commande introuvable : oras (absente du PATH). Installer oras et cosign (voir infra/docker/README.md).',
      ),
    );
  });

  it('échoue quand la résolution du tag ne rend pas un digest sha256', async () => {
    const commands = trustedCommands().on('oras', 'resolve', () => succeeds('latest\n'));

    await expect(verify(commands)).rejects.toThrow(
      new ReleaseVerificationError(`Digest du manifeste de version mal formé : latest.`),
    );
  });

  it('ne télécharge pas un manifeste de version dont la signature est refusée', async () => {
    const commands = trustedCommands().on('cosign', 'verify', () =>
      fails('no matching signatures: certificate identity mismatch'),
    );

    await expect(verify(commands)).rejects.toThrow(
      new ReleaseVerificationError(
        'Signature refusée pour le manifeste de version : cosign verify a échoué : no matching signatures: certificate identity mismatch',
      ),
    );
    expect(commands.callsTo('oras', 'pull')).toEqual([]);
  });

  it('nomme l’image dont la signature est refusée, par exemple signée pour un autre commit', async () => {
    const workerReference = imageReference('worker', 8);
    const commands = trustedCommands().on('cosign', 'verify', (args) => {
      if (args.at(-1) === workerReference) {
        return fails('expected certificate github workflow sha does not match');
      }
      return succeeds('[]');
    });

    await expect(verify(commands)).rejects.toThrow(
      new ReleaseVerificationError(
        'Signature refusée pour worker : cosign verify a échoué : expected certificate github workflow sha does not match',
      ),
    );
  });

  it('refuse un manifeste de version signé mais invalide', async () => {
    const duplicated = JSON.stringify({
      commit: COMMIT,
      images: [
        ...JSON.parse(manifestFor(COMMIT)).images,
        { name: 'api', reference: imageReference('api', 3) },
      ],
    });
    const commands = trustedCommands().on(
      'oras',
      'pull',
      writesManifest(() => duplicated),
    );

    await expect(verify(commands)).rejects.toThrow(
      new ReleaseManifestError('Image en double : api.'),
    );
    expect(commands.callsTo('cosign', 'verify')).toHaveLength(1);
  });
});

describe('isReleaseComplete', () => {
  let workingDirectory: string;

  beforeEach(() => {
    workingDirectory = mkdtempSync(join(tmpdir(), 'release-'));
  });

  afterEach(() => {
    rmSync(workingDirectory, { recursive: true, force: true });
  });

  it('six images présentes sans manifeste de version : publication incomplète', async () => {
    // Les images existent, mais aucun manifeste de version n'a été poussé : oras ne le trouve pas.
    const commands = trustedCommands().on('oras', 'resolve', () => fails('not found'));

    await expect(
      isReleaseComplete({ run: commands.run, expectedCommit: COMMIT, workingDirectory }),
    ).resolves.toBe(false);
  });

  it('manifeste présent mais une image non signée : publication incomplète', async () => {
    const commands = trustedCommands().on('cosign', 'verify', (args) => {
      if (args.at(-1)?.includes('trame-web')) {
        return fails('no signatures found');
      }
      return succeeds('[]');
    });

    await expect(
      isReleaseComplete({ run: commands.run, expectedCommit: COMMIT, workingDirectory }),
    ).resolves.toBe(false);
  });

  it('échoue quand oras manque, plutôt que de conclure à une publication incomplète', async () => {
    const commands = trustedCommands().on('oras', 'resolve', () =>
      fails('commande introuvable : oras (absente du PATH)'),
    );

    await expect(
      isReleaseComplete({ run: commands.run, expectedCommit: COMMIT, workingDirectory }),
    ).rejects.toThrow('Vérification impossible : commande introuvable : oras (absente du PATH).');
  });

  it('manifeste signé et six images vérifiées : publication terminée', async () => {
    await expect(
      isReleaseComplete({ run: trustedCommands().run, expectedCommit: COMMIT, workingDirectory }),
    ).resolves.toBe(true);
  });
});
