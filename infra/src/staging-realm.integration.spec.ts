import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
import { decodeJwt } from 'jose';
import { type KeycloakContainer, startKeycloakWithRealm } from './lib/keycloak-container';
import { totpCode } from './lib/totp';

/**
 * Scénarios d'authentification d'US-005 B2 (#47) sur un vrai Keycloak, avec le realm de staging
 * versionné : TOTP obligatoire, refus sans second facteur, force brute, password grant refusé.
 */
const REALM = 'trame-staging';
const CLIENT_ID = 'trame-web';
const REDIRECT_URI = 'https://staging.trame.wkhach.dev/oidc-callback';
const ORGANIZATION_ID = '019a4ac0-0000-7000-8000-0000000000b2';
const REALM_FILE = join(__dirname, '../keycloak/generated/trame-staging-realm.json');

interface TestAccount {
  username: string;
  password: string;
  id: string;
}

describe('realm de staging sur un vrai Keycloak (US-005 B2)', () => {
  let keycloak: KeycloakContainer;
  let browser: Browser;
  let enrolledSecret = '';
  const account: TestAccount = {
    username: 'kim-test',
    password: 'staging-test-' + process.pid,
    id: '',
  };

  beforeAll(async () => {
    keycloak = await startKeycloakWithRealm(REALM_FILE);
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    await keycloak?.stop();
  });

  async function admin(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await keycloak.adminToken();
    return fetch(`${keycloak.baseUrl}/admin/realms/${REALM}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  }

  /** Comme pour le compte de Kim : créé par l'administration, avec son organisation. */
  async function createAccount(username: string, password: string): Promise<string> {
    const response = await admin('/users', {
      method: 'POST',
      body: JSON.stringify({
        username,
        enabled: true,
        email: `${username}@example.invalid`,
        emailVerified: true,
        firstName: 'Test',
        lastName: 'Staging',
        attributes: { organization_id: [ORGANIZATION_ID] },
        credentials: [{ type: 'password', value: password, temporary: false }],
      }),
    });
    expect(response.status).toBe(201);
    const location = response.headers.get('location') ?? '';
    return location.slice(location.lastIndexOf('/') + 1);
  }

  /** Contexte de navigateur dont le callback de l'application est intercepté, sans réseau. */
  async function newLoginContext(): Promise<BrowserContext> {
    const context = await browser.newContext();
    await context.route('https://staging.trame.wkhach.dev/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Callback</title>' }),
    );
    return context;
  }

  function authorizationRequest(): { url: string; verifier: string } {
    const verifier = randomBytes(32).toString('base64url');
    const url = new URL(`${keycloak.baseUrl}/realms/${REALM}/protocol/openid-connect/auth`);
    url.search = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      scope: 'openid',
      redirect_uri: REDIRECT_URI,
      state: randomUUID(),
      nonce: randomUUID(),
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    }).toString();
    return { url: url.toString(), verifier };
  }

  async function submitPassword(page: Page, username: string, password: string): Promise<void> {
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('#kc-login').click();
  }

  function reachedCallback(page: Page): boolean {
    return page.url().startsWith(REDIRECT_URI);
  }

  async function exchangeCode(page: Page, verifier: string): Promise<string> {
    const code = new URL(page.url()).searchParams.get('code') ?? '';
    const response = await fetch(
      `${keycloak.baseUrl}/realms/${REALM}/protocol/openid-connect/token`,
      {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { access_token: string };
    return body.access_token;
  }

  function currentSeconds(): number {
    return Math.floor(performance.timeOrigin / 1000 + performance.now() / 1000);
  }

  it('ne contient aucun compte à l’import', async () => {
    const response = await admin('/users/count');

    expect(await response.json()).toBe(0);
  });

  it('Enrôlement TOTP obligatoire : aucun jeton avant l’enrôlement du second facteur', async () => {
    account.id = await createAccount(account.username, account.password);
    const context = await newLoginContext();
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      const request = authorizationRequest();
      await page.goto(request.url);
      await submitPassword(page, account.username, account.password);

      // Keycloak impose l'enrôlement : pas de redirection vers l'application.
      await page.locator('#mode-manual').click();
      enrolledSecret = (await page.locator('#kc-totp-secret-key').innerText()).trim();
      expect(reachedCallback(page)).toBe(false);

      await page.locator('#totp').fill(totpCode(enrolledSecret, currentSeconds()));
      await page.locator('#userLabel').fill('Test');
      await page.locator('#saveTOTPBtn').click();
      await page.waitForURL((url) => url.toString().startsWith(REDIRECT_URI));

      const claims = decodeJwt(await exchangeCode(page, request.verifier));
      expect(claims).toMatchObject({
        iss: `${keycloak.baseUrl}/realms/${REALM}`,
        organization_id: ORGANIZATION_ID,
        aud: expect.arrayContaining(['trame-api']),
      });
    } finally {
      await context.close();
    }
  });

  it('Connexion refusée sans second facteur : un code faux ne donne aucun jeton', async () => {
    const context = await newLoginContext();
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      const request = authorizationRequest();
      await page.goto(request.url);
      await submitPassword(page, account.username, account.password);

      await page.locator('#otp').fill('000000');
      await page.locator('#kc-login').click();
      // Keycloak réaffiche la saisie du code : aucune redirection vers l'application.
      await page.locator('#otp').waitFor({ state: 'visible' });
      expect(reachedCallback(page)).toBe(false);

      // Le code de l'enrôlement ne se réutilise pas : celui du pas suivant est admis par la
      // fenêtre de tolérance de Keycloak.
      await page.locator('#otp').fill(totpCode(enrolledSecret, currentSeconds() + 30));
      await page.locator('#kc-login').click();
      await page.waitForURL((url) => url.toString().startsWith(REDIRECT_URI));
      expect(await exchangeCode(page, request.verifier)).not.toBe('');
    } finally {
      await context.close();
    }
  });

  it('verrouille temporairement un compte après des échecs répétés', async () => {
    const target: TestAccount = {
      username: 'force-brute',
      password: 'staging-test-bf-' + process.pid,
      id: '',
    };
    target.id = await createAccount(target.username, target.password);
    const context = await newLoginContext();
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      await page.goto(authorizationRequest().url);
      for (let attempt = 0; attempt < 5; attempt++) {
        await submitPassword(page, target.username, 'mauvais-mot-de-passe');
      }

      const status = await (await admin(`/attack-detection/brute-force/users/${target.id}`)).json();
      expect(status).toMatchObject({ disabled: true });

      await submitPassword(page, target.username, target.password);
      expect(reachedCallback(page)).toBe(false);
    } finally {
      await context.close();
    }
  });

  it('refuse le password grant au client de l’application', async () => {
    const response = await fetch(
      `${keycloak.baseUrl}/realms/${REALM}/protocol/openid-connect/token`,
      {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: CLIENT_ID,
          username: account.username,
          password: account.password,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    expect(response.ok).toBe(false);
    expect(await response.json()).toMatchObject({ error: 'unauthorized_client' });
  });
});
