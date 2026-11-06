import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * La CI fait tourner les navigateurs dans l'image officielle de Playwright : elle doit rester à la
 * version du paquet du dépôt, car chaque version de Playwright pilote ses propres navigateurs.
 */
const REPOSITORY_ROOT = join(__dirname, '../..');
const PINNED_PLAYWRIGHT_IMAGE =
  /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble@sha256:[0-9a-f]{64}/g;

describe('navigateurs de la CI dans l’image officielle de Playwright', () => {
  let workflow: string;
  let playwrightVersion: string;

  beforeAll(async () => {
    workflow = await readFile(join(REPOSITORY_ROOT, '.github/workflows/ci.yml'), 'utf8');
    const manifest = JSON.parse(await readFile(join(REPOSITORY_ROOT, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    playwrightVersion = manifest.devDependencies['playwright'] ?? '';
  });

  it('épingle l’image par digest, à la version de Playwright du dépôt', () => {
    const versions = [...workflow.matchAll(PINNED_PLAYWRIGHT_IMAGE)].map((match) => match[1]);

    expect(versions).toHaveLength(1);
    expect(versions[0]).toBe(playwrightVersion);
  });

  it('n’installe plus de navigateur ni de paquet système à chaque passage', () => {
    expect(workflow).not.toMatch(/playwright install/);
  });
});
