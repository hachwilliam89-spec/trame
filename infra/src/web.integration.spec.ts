import { chromium, firefox, webkit, type Browser, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { compose, type ComposeOptions } from './lib/compose';
import {
  loadDemo,
  reserveFreePort,
  runPrisma,
  startApi,
  startStack,
  queryDatabase,
  type ApiProcess,
  type LoadedDemo,
} from './lib/dev-stack';
import { startWebServer } from './lib/web-test-server';
import { startDiagnosticProcesses } from './lib/diagnostic-processes';
import { launchTestBrowser } from './lib/test-browser';

/** Organisation des comptes de développement (`infra/keycloak/trame-realm.json`). */
const DEV_ORGANIZATION_ID = '019a4ac0-0000-7000-8000-000000000001';

describe('Front Guidé construit et chaîne réelle', () => {
  let demo: LoadedDemo;
  let stack: ComposeOptions;
  let api: ApiProcess;
  let databaseUrl: string;
  let web: Awaited<ReturnType<typeof startWebServer>>;
  let workers: Awaited<ReturnType<typeof startDiagnosticProcesses>>;
  beforeAll(async () => {
    const webPort = await reserveFreePort();
    const databasePort = await reserveFreePort();
    const keycloakPort = await reserveFreePort();
    const amqpPort = await reserveFreePort();
    stack = {
      projectName: 'trame-web-' + process.pid,
      overrides: {
        POSTGRES_PORT: String(databasePort),
        KEYCLOAK_PORT: String(keycloakPort),
        RABBITMQ_PORT: String(amqpPort),
        RABBITMQ_MANAGEMENT_PORT: String(await reserveFreePort()),
        KEYCLOAK_DEV_REDIRECT_URI: `http://127.0.0.1:${webPort}/oidc-callback`,
        KEYCLOAK_DEV_WEB_ORIGIN: `http://127.0.0.1:${webPort}`,
      },
    };
    databaseUrl = `postgresql://trame:trame@127.0.0.1:${databasePort}/trame`;
    const issuerOrigin = 'http://127.0.0.1:' + keycloakPort;
    await startStack(stack);
    await runPrisma(['migrate', 'deploy'], databaseUrl);
    api = await startApi(await reserveFreePort(), databaseUrl, issuerOrigin + '/realms/trame');
    web = await startWebServer({
      port: webPort,
      apiOrigin: new URL(api.baseUrl).origin,
      issuerOrigin,
    });
    workers = await startDiagnosticProcesses({
      databaseUrl,
      amqpUrl: `amqp://trame:trame@127.0.0.1:${amqpPort}`,
    });
    demo = await loadDemo(databaseUrl, DEV_ORGANIZATION_ID);
  });
  afterAll(async () => {
    await workers?.stop();
    await web?.stop();
    await api?.stop();
    if (stack) await compose(['down', '--volumes'], stack);
  });
  async function login(page: Page, role: string) {
    const traffic: string[] = [];
    page.on('requestfailed', (request) =>
      traffic.push(new URL(request.url()).pathname + ': ' + request.failure()?.errorText),
    );
    page.on('response', (response) => {
      if (new URL(response.url()).pathname.endsWith('/token'))
        traffic.push('token HTTP ' + response.status());
    });
    await page.addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (event) =>
        console.warn('CSP ' + event.violatedDirective),
      ),
    );
    page.on('console', (message) => {
      if (message.text().startsWith('CSP ')) traffic.push(message.text());
    });
    await page.goto(web.origin);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await page.locator('#username').fill('dev-' + role);
    await page.locator('#password').fill('trame-local-only');
    await page.locator('#kc-login').click();
    await page.waitForURL((url) => url.origin === web.origin && url.pathname === '/');
    await page
      .getByRole('heading', { name: 'Tester le moteur', exact: true })
      .waitFor({ timeout: 8000 })
      .catch(async () => {
        throw new Error(
          'Retour de connexion : ' +
            (await page.locator('body').innerText()) +
            '\n' +
            traffic.join('\n'),
        );
      });
  }
  async function noViolations(page: Page) {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(result.violations).toEqual([]);
  }
  for (const [name, browserType] of [
    ['Chromium', chromium],
    ['Firefox', firefox],
    ['WebKit', webkit],
  ] as const) {
    it(`${name} : connexion, calcul Python, résultat conservé et accessibilité`, async () => {
      const browser: Browser = await launchTestBrowser(browserType);
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(web.origin);
        await noViolations(page);
        await login(page, 'manager');
        await page.getByRole('button', { name: 'Tester le moteur', exact: true }).click();
        await page
          .getByRole('heading', { name: 'Les trois tâches ont été affectées.', exact: true })
          .waitFor({ timeout: 25_000 });
        expect(await page.getByRole('cell', { name: 'Poste 2', exact: true }).count()).toBe(1);
        const rendering = await page.locator('tr-assignment-weave').evaluate((element) => {
          const thread = element.querySelector('path');
          if (!thread) throw new Error('Affectation sans fil visible');
          const style = getComputedStyle(thread);
          return {
            fill: style.fill,
            stroke: style.stroke,
            width: element.getBoundingClientRect().width,
          };
        });
        expect(rendering.fill).toBe('none');
        expect(rendering.stroke).not.toBe('none');
        expect(rendering.width).toBeLessThanOrEqual(520);
        expect(
          await page
            .locator('.fact dd')
            .first()
            .evaluate((element) => getComputedStyle(element).textAlign),
        ).toBe('left');
        // Les polices du design system sont servies par le site : la CSP refuserait toute autre origine.
        // fonts.check() répond « vrai » quand aucune police ne porte ce nom : on charge pour de bon.
        const loadedFaces = await page.evaluate(async () => {
          async function countLoaded(font: string): Promise<number> {
            try {
              const faces = await document.fonts.load(font);
              return faces.filter((face) => face.status === 'loaded').length;
            } catch {
              return 0;
            }
          }
          return {
            text: await countLoaded('14px "IBM Plex Sans"'),
            titles: await countLoaded('600 30px "Bricolage Grotesque Variable"'),
            data: await countLoaded('500 20px "IBM Plex Mono"'),
          };
        });
        expect(loadedFaces.text).toBeGreaterThan(0);
        expect(loadedFaces.titles).toBeGreaterThan(0);
        expect(loadedFaces.data).toBeGreaterThan(0);
        await noViolations(page);
        const stored = await page.evaluate(() => ({ ...sessionStorage, ...localStorage }));
        expect(JSON.stringify(stored)).not.toMatch(/eyJ[a-zA-Z0-9_-]+\.eyJ/);
        expect(page.url()).not.toContain('access_token');
        await page.reload();
        await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
        await page
          .getByRole('heading', { name: 'Les trois tâches ont été affectées.', exact: true })
          .waitFor({ timeout: 15_000 });
        let logoutMethod: string | undefined;
        let hintInUrl = false;
        page.on('request', (request) => {
          const url = new URL(request.url());
          if (url.pathname.endsWith('/protocol/openid-connect/logout')) {
            logoutMethod = request.method();
            hintInUrl = url.searchParams.has('id_token_hint');
          }
        });
        await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
        await page
          .getByRole('button', { name: 'Se connecter', exact: true })
          .waitFor({ timeout: 15000 });
        expect(logoutMethod).toBe('POST');
        expect(hintInUrl).toBe(false);
        expect(errors).toEqual([]);
      } finally {
        await browser.close();
      }
    }, 90_000);
  }
  /** Le lien d'une semaine, ouvert avant la connexion : il doit survivre au retour de Keycloak. */
  async function openPlanningAsManager(page: Page): Promise<void> {
    const query = new URLSearchParams({ site: demo.siteId, semaine: demo.weekStartsOn });
    await page.goto(`${web.origin}/planning?${query.toString()}`);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await page.locator('#username').fill('dev-manager');
    await page.locator('#password').fill('trame-local-only');
    await page.locator('#kc-login').click();
    await page.waitForURL(
      (url) => url.pathname === '/planning' && url.searchParams.get('site') === demo.siteId,
    );
    await page.getByText('Entrepôt de démonstration', { exact: false }).first().waitFor();
  }

  /**
   * Lance ou relance le calcul de la semaine, puis attend la relecture de cette génération : le
   * planning d'un navigateur précédent est déjà affiché, il ne prouve rien.
   */
  async function generateWeek(page: Page): Promise<void> {
    const started = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/schedule-generations',
    );
    await page.locator('.attempt button').click();
    const response = await started;
    expect(response.status()).toBe(202);
    const { id } = (await response.json()) as { id: string };
    await page
      .waitForResponse(
        (reread) =>
          reread.request().method() === 'GET' &&
          new URL(reread.url()).pathname === `/api/v1/schedule-generations/${id}`,
        { timeout: 30_000 },
      )
      .catch(async () => {
        throw new Error(
          'UI: ' +
            (await page.locator('body').innerText()) +
            '\nPROCESSUS: ' +
            workers.logs().slice(-4000),
        );
      });
    await page.getByText('Planning proposé.', { exact: true }).waitFor();
  }

  for (const [name, browserType] of [
    ['Chromium', chromium],
    ['Firefox', firefox],
    ['WebKit', webkit],
  ] as const) {
    it(`${name} : lien de la semaine, génération, grille et manque du samedi, accessibilité`, async () => {
      const browser: Browser = await launchTestBrowser(browserType);
      const page = await (await browser.newContext()).newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await openPlanningAsManager(page);
        await generateWeek(page);

        expect(await page.locator('.week-grid tbody tr').count()).toBe(12);
        const gaps = page.locator('.gaps summary');
        expect(await gaps.count()).toBe(1);
        expect(await gaps.locator('strong').innerText()).toMatch(/^Samedi \d+ · Matin · Cariste$/);
        expect(await gaps.locator('.gap-count').innerText()).toBe('2 affectés sur 3 · 1 manquant');
        expect(await page.locator('.coverage .meta').first().innerText()).toMatch(
          /^50 places pourvues sur 51 · 98(,0)?\s?%$/,
        );
        await page.getByRole('button', { name: 'Voir les règles appliquées', exact: true }).click();
        await page
          .getByText('Repos quotidien d’au moins 11 h consécutives', { exact: false })
          .waitFor();
        await noViolations(page);
        expect(errors).toEqual([]);
      } finally {
        await browser.close();
      }
    }, 90_000);
  }

  it('ouvre le planning depuis la navigation mobile et montre la vue Jour par défaut', async () => {
    const browser = await launchTestBrowser(chromium);
    const context = await browser.newContext({ viewport: { width: 375, height: 900 } });
    const page = await context.newPage();
    try {
      await login(page, 'manager');
      await page.getByRole('link', { name: 'Planning', exact: true }).click();
      const site = page.getByLabel('Site', { exact: true });
      await site.locator(`option[value="${demo.siteId}"]`).waitFor({ state: 'attached' });
      expect(await site.inputValue()).toBe(demo.siteId);
      await page.getByLabel('Jour de la semaine').fill(demo.weekStartsOn);
      await noViolations(page);
      await page.getByRole('button', { name: 'Ouvrir la semaine' }).click();
      await page.waitForURL(
        (url) =>
          url.searchParams.get('site') === demo.siteId &&
          url.searchParams.get('semaine') === demo.weekStartsOn,
      );
      await page
        .locator('.week-grid')
        .waitFor({ timeout: 30_000 })
        .catch(() => generateWeek(page));
      await page.locator('.week-grid').waitFor();

      const options = await page.locator('.team select option').allInnerTexts();
      expect(options).not.toContain('Semaine complète');
      expect(await page.locator('.week-grid thead th').count()).toBe(3);
      await noViolations(page);
      await page.getByRole('link', { name: 'Trame, accueil', exact: true }).click();
      await page.getByRole('heading', { name: 'Tester le moteur', exact: true }).waitFor();
    } finally {
      await browser.close();
    }
  }, 60_000);

  it('interrompt puis reprend le suivi sans créer de nouveau calcul', async () => {
    const browser = await launchTestBrowser(chromium);
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await login(page, 'manager');
      let interrupted = false;
      await page.route('**/api/v1/diagnostics/solver-runs/*/events', async (route) => {
        if (interrupted) {
          await route.continue();
        } else {
          interrupted = true;
          await route.abort();
        }
      });
      const creations: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/solver-runs'))
          creations.push(request.url());
      });
      await page.getByRole('button', { name: 'Tester le moteur', exact: true }).click();
      await page.getByText('Le suivi a été interrompu', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Reprendre le suivi', exact: true }).click();
      await page
        .getByRole('heading', { name: 'Les trois tâches ont été affectées.', exact: true })
        .waitFor({ timeout: 20_000 })
        .catch(async () => {
          throw new Error(
            'UI: ' +
              (await page.locator('body').innerText()) +
              '\nPROCESSUS: ' +
              workers.logs().slice(-4000),
          );
        });
      expect(creations).toHaveLength(1);
    } finally {
      await browser.close();
    }
  }, 60_000);
  it('refuse le test à l’employé et reste utilisable à 320 pixels', async () => {
    const browser = await launchTestBrowser(chromium);
    const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
    const page = await context.newPage();
    try {
      await login(page, 'employee');
      await page.getByText('Vous n’avez pas accès à ce diagnostic', { exact: true }).waitFor();
      expect(
        await page.getByRole('button', { name: 'Tester le moteur', exact: true }).count(),
      ).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      await noViolations(page);
    } finally {
      await browser.close();
    }
  });
  it('ferme la session expirée puis retrouve le même calcul après reconnexion', async () => {
    const browser = await launchTestBrowser(chromium);
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.clock.install();
      await login(page, 'manager');
      const creations: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/solver-runs'))
          creations.push(request.url());
      });
      await page.getByRole('button', { name: 'Tester le moteur', exact: true }).click();
      await page
        .getByRole('heading', { name: 'Les trois tâches ont été affectées.', exact: true })
        .waitFor({ timeout: 20_000 });
      await page.clock.fastForward(6 * 60 * 1000);
      await page.getByText('Votre session a expiré', { exact: true }).waitFor();
      // L'accueil ne garde que sa maquette annoncée : aucun tableau ni titre du calcul ne reste.
      expect(await page.getByRole('table').count()).toBe(1);
      expect(await page.getByRole('table', { name: /^Maquette/ }).count()).toBe(1);
      expect(
        await page
          .getByRole('heading', { name: 'Les trois tâches ont été affectées.', exact: true })
          .count(),
      ).toBe(0);
      await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      await page
        .getByRole('heading', { name: 'Les trois tâches ont été affectées.', exact: true })
        .waitFor({ timeout: 20_000 });
      expect(creations).toHaveLength(1);
    } finally {
      await browser.close();
    }
  }, 60_000);
  it('ne révèle pas un job étranger injecté dans le marque-page du navigateur', async () => {
    const foreignId = '0190f0a0-0000-7000-8000-000000000099';
    await queryDatabase(
      databaseUrl,
      "INSERT INTO scheduling.diagnostic_runs (id,organization_id,idempotency_key,status,created_at) VALUES ('0190f0a0-0000-7000-8000-000000000099','0190f0a0-0000-7000-8000-00000000000b','foreign-web-proof','QUEUED','2026-11-05T10:00:00Z')",
    );
    const browser = await launchTestBrowser(chromium);
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await login(page, 'manager');
      await page.getByRole('button', { name: 'Tester le moteur', exact: true }).click();
      await page
        .getByRole('heading', { name: 'Les trois tâches ont été affectées.', exact: true })
        .waitFor({ timeout: 20_000 });
      await page.evaluate((id) => {
        const key = Object.keys(sessionStorage).find((key) => key.startsWith('trame.diagnostic.'));
        if (key === undefined) throw new Error('Marque-page de test absent');
        const bookmark = JSON.parse(sessionStorage.getItem(key) ?? '{}');
        bookmark.runId = id;
        sessionStorage.setItem(key, JSON.stringify(bookmark));
      }, foreignId);
      await page.reload();
      await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      await page.getByText('Diagnostic introuvable', { exact: true }).waitFor({ timeout: 15_000 });
      expect(await page.getByRole('table').count()).toBe(0);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
