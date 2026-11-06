import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeCommands, fails, succeeds } from '../testing/fake-commands';
import { type LayoutBuilder, writeStandardLayout } from '../testing/oci-layout-builder';
import { IMAGE_NAMES } from './policy';
import { PublicationError, type ScannedLayout, publishRelease } from './publish-release';

const COMMIT = '9'.repeat(40);
const RELEASE = 'ghcr.io/hachwilliam89-spec/trame-release';
const RELEASE_DIGEST = `sha256:${'7'.repeat(64)}`;

/**
 * Faux registre GHCR derrière de faux oras et cosign : il retient ce qui a été poussé, rend les
 * digests poussés, et rejoue au téléchargement le manifeste de version reçu.
 */
class FakeRegistry {
  readonly commands = new FakeCommands();
  readonly digestsByTag = new Map<string, string>();
  pushedManifest = '';
  /** Digest rendu par le registre à la place de celui poussé, pour simuler une altération. */
  alteredDigests = new Map<string, string>();
  privatePackages = new Set<string>();

  constructor() {
    this.commands
      .on('oras', 'cp', (args) => {
        const [source, target] = args.slice(-2);
        const digest = (source ?? '').split('@')[1] ?? '';
        this.digestsByTag.set(target ?? '', this.alteredDigests.get(target ?? '') ?? digest);
        return succeeds();
      })
      .on('oras', 'resolve', (args) => {
        const digest = this.digestsByTag.get(args[1] ?? '');
        return digest === undefined ? fails('not found') : succeeds(`${digest}\n`);
      })
      .on('oras', 'push', (args, options) => {
        this.pushedManifest = readFileSync(
          join(options?.workingDirectory ?? '', 'images.json'),
          'utf8',
        );
        this.digestsByTag.set(args[1] ?? '', RELEASE_DIGEST);
        return succeeds();
      })
      .on('oras', 'pull', (args) => {
        const outputDirectory = args[args.indexOf('-o') + 1] ?? '';
        writeFileSync(join(outputDirectory, 'images.json'), this.pushedManifest);
        return succeeds();
      })
      .on('oras', 'manifest', (args) => {
        const reference = args.at(-1) ?? '';
        const repository = reference.split('@')[0] ?? '';
        if (this.privatePackages.has(repository)) {
          return fails('unauthorized: authentication required');
        }
        return succeeds('{}');
      })
      .on('cosign', 'sign', () => succeeds())
      .on('cosign', 'verify', () => succeeds('[]'));
  }

  callOrder(): string[] {
    return this.commands.calls.map((call) => `${call[0]} ${call[1]}`);
  }
}

describe('publishRelease, avec un faux registre', () => {
  let layouts: LayoutBuilder[];
  let scannedLayouts: ScannedLayout[];
  let workingDirectory: string;
  let messages: string[];

  beforeEach(() => {
    layouts = [];
    scannedLayouts = IMAGE_NAMES.map((name) => {
      const { layout, digest } = writeStandardLayout();
      layouts.push(layout);
      return { name, directory: layout.directory, scannedDigest: digest };
    });
    workingDirectory = mkdtempSync(join(tmpdir(), 'publish-'));
    messages = [];
  });

  afterEach(() => {
    for (const layout of layouts) {
      layout.remove();
    }
    rmSync(workingDirectory, { recursive: true, force: true });
  });

  function publish(registry: FakeRegistry, isMainHead = async () => true) {
    return publishRelease({
      run: registry.commands.run,
      commit: COMMIT,
      layouts: scannedLayouts,
      workingDirectory,
      isMainHead,
      report: (message) => messages.push(message),
    });
  }

  it('pousse les six layouts scannés, signe, vérifie, puis publie le manifeste de version en dernier', async () => {
    const registry = new FakeRegistry();

    const outcome = await publish(registry);

    expect(outcome.published).toBe(true);
    const copies = registry.commands.callsTo('oras', 'cp');
    expect(copies).toHaveLength(6);
    expect(copies[0]).toEqual([
      'oras',
      'cp',
      '--from-oci-layout',
      `${scannedLayouts[0]?.directory}@${scannedLayouts[0]?.scannedDigest}`,
      `ghcr.io/hachwilliam89-spec/trame-api:${COMMIT}`,
    ]);
    const order = registry.callOrder();
    const lastImageCopy = order.lastIndexOf('oras cp');
    expect(order.indexOf('cosign sign')).toBeGreaterThan(lastImageCopy);
    const anonymousImageChecks = order
      .flatMap((call, index) => (call === 'oras manifest' ? [index] : []))
      .slice(0, 6);
    expect(order.indexOf('oras push')).toBeGreaterThan(anonymousImageChecks.at(-1) ?? Infinity);
    expect(JSON.parse(registry.pushedManifest).commit).toBe(COMMIT);
    for (const call of registry.commands.callsTo('cosign', 'sign')) {
      expect(call).toContain(`commit=${COMMIT}`);
      expect(call.at(-1)).toMatch(/@sha256:[0-9a-f]{64}$/);
    }
  });

  it('A est admissible, puis B arrive pendant la construction : rien n’est poussé', async () => {
    const registry = new FakeRegistry();

    const outcome = await publish(registry, async () => false);

    expect(outcome).toEqual({
      published: false,
      reason: `main a avancé depuis le contrôle : ${COMMIT} n’est plus la tête, rien n’est poussé.`,
    });
    expect(registry.commands.calls).toEqual([]);
  });

  it('refuse un layout qui n’est pas celui qui a été scanné, avant tout push', async () => {
    const registry = new FakeRegistry();
    const tampered = scannedLayouts[2] as ScannedLayout;
    scannedLayouts[2] = { ...tampered, scannedDigest: `sha256:${'0'.repeat(64)}` };

    await expect(publish(registry)).rejects.toThrow(
      new PublicationError(
        `Le layout de migrator (${tampered.scannedDigest}) n’est pas celui qui a été scanné (sha256:${'0'.repeat(64)}).`,
      ),
    );
    expect(registry.commands.calls).toEqual([]);
  });

  it('s’arrête sans signer quand le registre rend un autre digest que celui poussé', async () => {
    const registry = new FakeRegistry();
    registry.alteredDigests.set(
      `ghcr.io/hachwilliam89-spec/trame-web:${COMMIT}`,
      `sha256:${'5'.repeat(64)}`,
    );

    await expect(publish(registry)).rejects.toThrow(
      new PublicationError(
        `Digest publié différent pour web : sha256:${'5'.repeat(64)} au lieu de ${scannedLayouts[3]?.scannedDigest}.`,
      ),
    );
    expect(registry.commands.callsTo('cosign', 'sign')).toEqual([]);
    expect(registry.commands.callsTo('oras', 'push')).toEqual([]);
  });

  it('premier passage : les six packages privés arrêtent avant le manifeste de version', async () => {
    const registry = new FakeRegistry();
    registry.privatePackages.add('ghcr.io/hachwilliam89-spec/trame-api');

    await expect(publish(registry)).rejects.toThrow(
      new PublicationError(
        'Téléchargement anonyme impossible pour api : rends le package ghcr.io/hachwilliam89-spec/trame-api public, puis relance le job échoué.',
      ),
    );
    expect(registry.commands.callsTo('oras', 'push')).toEqual([]);
  });

  it('premier passage : le manifeste de version privé empêche de conclure', async () => {
    const registry = new FakeRegistry();
    registry.privatePackages.add(RELEASE);

    await expect(publish(registry)).rejects.toThrow(
      new PublicationError(
        `Téléchargement anonyme impossible pour le manifeste de version : rends le package ${RELEASE} public, puis relance le job échoué.`,
      ),
    );
  });

  it('vérifie la signature de chaque image avant de publier le manifeste de version', async () => {
    const registry = new FakeRegistry();
    registry.commands.on('cosign', 'verify', (args) => {
      if (args.at(-1)?.includes('trame-engine')) {
        return fails('no matching signatures');
      }
      return succeeds('[]');
    });

    await expect(publish(registry)).rejects.toThrow(
      'cosign verify a échoué : no matching signatures',
    );
    expect(registry.commands.callsTo('oras', 'push')).toEqual([]);
  });

  it('le téléchargement anonyme n’utilise aucun identifiant', async () => {
    const registry = new FakeRegistry();

    await publish(registry);

    const anonymousFetches = registry.commands.callsTo('oras', 'manifest');
    expect(anonymousFetches).toHaveLength(7);
    for (const call of anonymousFetches) {
      const configPath = call[call.indexOf('--registry-config') + 1] ?? '';
      expect(readFileSync(configPath, 'utf8')).toBe('{}');
    }
  });
});
