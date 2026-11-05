import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const entrypoint = resolve(__dirname, '../docker/web/entrypoint.sh');
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'trame-web-config-'));
});
afterEach(async () => rm(directory, { recursive: true, force: true }));

function configure(overrides: Record<string, string | undefined> = {}) {
  return execute('sh', [entrypoint, 'true'], {
    env: {
      PATH: process.env['PATH'],
      WEB_RUNTIME_DIR: directory,
      WEB_AUTH_SERVER_URL: 'https://auth.trame.wkhach.dev',
      WEB_AUTH_REALM: 'trame-staging',
      WEB_AUTH_CLIENT_ID: 'trame-web',
      ...overrides,
    },
  });
}

it('exige toute la configuration et ne journalise pas la valeur rejetée', async () => {
  for (const name of ['WEB_AUTH_SERVER_URL', 'WEB_AUTH_REALM', 'WEB_AUTH_CLIENT_ID']) {
    await expect(configure({ [name]: undefined })).rejects.toMatchObject({ code: 1 });
  }
  await expect(configure({ WEB_AUTH_CLIENT_ID: 'secret-canary"injected' })).rejects.toMatchObject({
    code: 1,
    stderr: 'trame_web_configuration_invalid\n',
  });
});

it('refuse les URL dangereuses et HTTP hors loopback', async () => {
  for (const url of [
    'http://auth.example.org',
    'https://user:password@auth.example.org',
    'https://auth.example.org?secret=canary',
    'https://auth.example.org/"injection',
    'https://auth.example.org\nheader',
  ]) {
    await expect(configure({ WEB_AUTH_SERVER_URL: url })).rejects.toMatchObject({ code: 1 });
  }
});

it('écrit seulement la configuration publique au démarrage', async () => {
  await configure({ DATABASE_URL: 'secret-canary', WEB_AUTH_SERVER_URL: 'http://127.0.0.1:18080' });
  expect(JSON.parse(await readFile(join(directory, 'config.json'), 'utf8'))).toEqual({
    apiBasePath: '/api/v1',
    authServerUrl: 'http://127.0.0.1:18080',
    realm: 'trame-staging',
    clientId: 'trame-web',
  });
});
