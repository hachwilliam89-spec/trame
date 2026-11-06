import { chromium, type Page } from 'playwright';
import { randomUUID } from 'node:crypto';
import { reserveFreePort } from './lib/dev-stack';
import { docker, imageCompose, type ImageStack } from './lib/image-stack';
import { launchTestBrowser } from './lib/test-browser';

let stack: ImageStack;
let origin: string;
beforeAll(async () => {
  stack = {
    project: 'trame-images-' + randomUUID(),
    webPort: await reserveFreePort(),
    keycloakPort: await reserveFreePort(),
  };
  origin = 'http://127.0.0.1:' + stack.webPort;
  await imageCompose(stack, ['build']);
  try {
    await imageCompose(stack, ['up', '--detach', '--wait', '--wait-timeout', '180']);
  } catch (error) {
    const logs = await imageCompose(stack, [
      'logs',
      '--no-color',
      '--tail',
      '60',
      'api',
      'relay',
      'engine',
      'worker',
      'migrator',
      'web',
    ]);
    throw new Error('Échec de la stack de test fictive :\n' + logs, { cause: error });
  }
});
afterAll(async () => {
  if (stack) {
    try {
      const ids = (await imageCompose(stack, ['ps', '--quiet'])).trim().split('\n').filter(Boolean);
      if (ids.length > 0) {
        const memory = await docker([
          'stats',
          '--no-stream',
          '--format',
          '{{.Name}}: {{.MemUsage}}',
          ...ids,
        ]);
        process.stdout.write(
          'Mémoire de la fixture après le parcours (pas un pic métier) :\n' + memory,
        );
      }
    } finally {
      await imageCompose(stack, ['down', '--volumes', '--remove-orphans']);
    }
  }
});

async function login(page: Page, role: string) {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.locator('#username').fill('dev-' + role);
  await page.locator('#password').fill('trame-local-only');
  await page.locator('#kc-login').click();
  await page.getByRole('heading', { name: 'Tester le moteur', exact: true }).waitFor();
}

it('sert la configuration injectée et l’API prête depuis les vraies images', async () => {
  const config = await fetch(origin + '/config.json');
  expect(config.headers.get('cache-control')).toBe('no-store');
  expect(await config.json()).toMatchObject({
    authServerUrl: 'http://127.0.0.1:' + stack.keycloakPort,
    realm: 'trame',
    apiBasePath: '/api/v1',
  });
  expect((await fetch(origin + '/api/v1/health/ready')).status).toBe(200);
  expect((await fetch(origin + '/api/v1/sites')).status).toBe(401);
});

it('utilise des processus non root, des fichiers en lecture seule et des logs plafonnés', async () => {
  for (const service of ['api', 'relay', 'engine', 'worker', 'web']) {
    const id = (await imageCompose(stack, ['ps', '--quiet', service])).trim();
    const [container] = JSON.parse(await docker(['inspect', id]));
    expect(container.Config.Image).toBe(stack.project + '-' + service + ':local');
    expect(
      (await docker(['image', 'inspect', '--format', '{{.Architecture}}', container.Image])).trim(),
    ).toBe('amd64');
    const uid = await imageCompose(stack, ['exec', '-T', service, 'id', '-u']);
    expect(Number(uid.trim()), service).toBeGreaterThan(0);
    expect(container.HostConfig.ReadonlyRootfs, service).toBe(true);
    expect(container.HostConfig.CapDrop).toContain('ALL');
    expect(container.HostConfig.LogConfig.Config).toMatchObject({
      'max-size': '10m',
      'max-file': '3',
    });
    expect(
      container.Mounts.every(
        (mount: { Destination: string }) => !mount.Destination.includes('docker.sock'),
      ),
    ).toBe(true);
  }
  const contents = await imageCompose(stack, [
    'exec',
    '-T',
    'api',
    'sh',
    '-ec',
    'test ! -e /workspace; test ! -e /app/.env; test ! -e /app/node_modules/nx; test ! -e /app/node_modules/tsx',
  ]);
  expect(contents).toBe('');
});

it('refuse une configuration absente ou invalide sans afficher de secret', async () => {
  const canary = 'trame-test-secret-must-not-be-logged';
  const invalidConfiguration: Record<string, string[]> = {
    api: ['DATABASE_URL=invalid:' + canary],
    relay: ['DATABASE_URL=postgresql://invalid/trame', 'AMQP_URL=https://' + canary],
    worker: ['AMQP_URL=invalid:' + canary],
    web: ['WEB_AUTH_SERVER_URL=https://user:' + canary + '@identity.invalid'],
    migrator: ['DATABASE_URL=invalid:' + canary],
  };
  for (const service of ['api', 'relay', 'worker', 'web', 'migrator']) {
    for (const configuration of [[], invalidConfiguration[service] ?? []]) {
      let failure: unknown;
      try {
        await docker([
          'run',
          '--rm',
          '--read-only',
          '--tmpfs',
          '/tmp',
          '--env',
          'TRAME_TEST_SECRET=' + canary,
          ...configuration.flatMap((value) => ['--env', value]),
          stack.project + '-' + service + ':local',
        ]);
      } catch (error) {
        failure = error;
      }
      expect(failure, service).toMatchObject({ code: 1 });
      const output = failure as { stdout: string; stderr: string };
      expect(output.stdout + output.stderr, service).not.toContain(canary);
    }
  }
});

it('réserve le DDL au migrateur et vérifie l’absence de dérive Prisma', async () => {
  await imageCompose(stack, [
    'run',
    '--rm',
    'migrator',
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    'prisma/schema.prisma',
    '--exit-code',
  ]);
  const query =
    "SELECT has_schema_privilege('trame_api','organization','CREATE') AS ddl, " +
    "has_table_privilege('trame_api','scheduling.diagnostic_runs','INSERT') AS dml";
  const result = await imageCompose(stack, [
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'trame',
    '-d',
    'trame',
    '-Atc',
    query,
  ]);
  expect(result.trim()).toBe('f|t');
});

it('exécute le calcul Python via le front et reprend le suivi après une coupure', async () => {
  const browser = await launchTestBrowser(chromium);
  const page = await browser.newPage();
  try {
    await login(page, 'manager');
    let interrupted = false;
    let creations = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/solver-runs')) creations += 1;
    });
    await page.route('**/solver-runs/*/events', async (route) => {
      if (interrupted) await route.continue();
      else {
        interrupted = true;
        await route.abort();
      }
    });
    await page.getByRole('button', { name: 'Tester le moteur', exact: true }).click();
    await page.getByText('Le suivi a été interrompu', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Reprendre le suivi', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Les trois tâches ont été affectées.', exact: true })
      .waitFor({ timeout: 30_000 });
    expect(creations).toBe(1);
    // L'API doit refuser un identifiant appartenant à une autre organisation.
    await imageCompose(stack, [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'trame',
      '-d',
      'trame',
      '-c',
      "INSERT INTO scheduling.diagnostic_runs (id,organization_id,idempotency_key,status,created_at) VALUES ('0190f0a0-0000-7000-8000-000000000099','0190f0a0-0000-7000-8000-00000000000b','foreign-image-proof','QUEUED','2026-11-05T10:00:00Z')",
    ]);
    await page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((name) => name.startsWith('trame.diagnostic.'));
      if (key === undefined) throw new Error('Marque-page absent');
      const bookmark = JSON.parse(sessionStorage.getItem(key) ?? '{}');
      bookmark.runId = '0190f0a0-0000-7000-8000-000000000099';
      sessionStorage.setItem(key, JSON.stringify(bookmark));
    });
    const denied = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/0190f0a0-0000-7000-8000-000000000099'),
    );
    await page.reload();
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await page.getByText('Diagnostic introuvable', { exact: true }).waitFor();
    expect((await denied).status()).toBe(404);
    expect(await page.getByRole('table').count()).toBe(0);
  } finally {
    await browser.close();
  }
});

it('refuse le diagnostic à l’employé sur la chaîne conteneurisée', async () => {
  const browser = await launchTestBrowser(chromium);
  const page = await browser.newPage();
  try {
    const tokenResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/protocol/openid-connect/token'),
    );
    await login(page, 'employee');
    const tokens: { access_token: string } = await (await tokenResponse).json();
    const refused = await fetch(origin + '/api/v1/diagnostics/solver-runs', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + tokens.access_token,
        'content-type': 'application/json',
        'idempotency-key': 'employee-images-denied',
      },
      body: '{}',
    });
    expect(refused.status).toBe(403);
    await page.getByText('Vous n’avez pas accès à ce diagnostic', { exact: true }).waitFor();
    expect(await page.getByRole('button', { name: 'Tester le moteur', exact: true }).count()).toBe(
      0,
    );
  } finally {
    await browser.close();
  }
});
