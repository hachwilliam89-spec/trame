import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * La CI fait tourner les navigateurs dans l'image officielle de Playwright : elle doit rester à la
 * version du paquet du dépôt, car chaque version de Playwright pilote ses propres navigateurs.
 * L'image est épinglée à un seul endroit, l'action qui démarre le serveur Playwright, pour que la
 * CI et la répétition du staging utilisent la même.
 */
const REPOSITORY_ROOT = join(__dirname, '../..');
const PLAYWRIGHT_SERVER_ACTION = '.github/actions/playwright-server/action.yml';
const WORKFLOWS_WITH_BROWSERS = ['.github/workflows/ci.yml', '.github/workflows/rehearsal.yml'];
const PINNED_PLAYWRIGHT_IMAGE =
  /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble@sha256:[0-9a-f]{64}/g;

function readRepositoryFile(path: string): Promise<string> {
  return readFile(join(REPOSITORY_ROOT, path), 'utf8');
}

describe('navigateurs de la CI dans l’image officielle de Playwright', () => {
  let playwrightVersion: string;

  beforeAll(async () => {
    const manifest = JSON.parse(await readRepositoryFile('package.json')) as {
      devDependencies: Record<string, string>;
    };
    playwrightVersion = manifest.devDependencies['playwright'] ?? '';
  });

  it('épingle l’image par digest, à la version de Playwright du dépôt', async () => {
    const action = await readRepositoryFile(PLAYWRIGHT_SERVER_ACTION);

    const versions = [...action.matchAll(PINNED_PLAYWRIGHT_IMAGE)].map((match) => match[1]);

    expect(versions).toHaveLength(1);
    expect(versions[0]).toBe(playwrightVersion);
  });

  it.each(WORKFLOWS_WITH_BROWSERS)(
    'démarre les navigateurs de %s par cette action, sans autre image ni installation',
    async (workflowPath) => {
      const workflow = await readRepositoryFile(workflowPath);

      expect(workflow).toContain('/.github/actions/playwright-server');
      expect(workflow).not.toContain('mcr.microsoft.com/playwright');
      expect(workflow).not.toMatch(/playwright install/);
    },
  );
});
