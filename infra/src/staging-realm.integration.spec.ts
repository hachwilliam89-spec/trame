import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
import { decodeJwt } from 'jose';
import { type KeycloakContainer, startKeycloakWithRealm } from './lib/keycloak-container';
import { totpCode } from './lib/totp';

/**
 * Scénarios d'authentification d'US-005 B2 (#47) sur un vrai Keycloak, avec le realm de staging
 * versionné : TOTP obligatoire, y compris après sa réinitialisation, refus sans second facteur,
 * force brute, password grant refusé.
 */
const REALM = 'trame-staging';
const CLIENT_ID = 'trame-web';
const REDIRECT_URI = 'https://staging.trame.wkhach.dev/oidc-callback';
const ORGANIZATION_ID = '019a4ac0-0000-7000-8000-0000000000b2';
const REALM_FILE = join(__dirname, '../keycloak/generated/trame-staging-realm.json');
/**
 * Playwright n'intercepte pas une navigation issue d'une redirection : le nom du staging ne doit
 * donc jamais se résoudre, même une fois son DNS publié, pour qu'aucun code ne quitte le test.
 */
const UNRESOLVABLE_APPLICATION_HOST =
  '--host-resolver-rules=MAP staging.trame.wkhach.dev ~NOTFOUND';

interface TestAccount {
  username: string;
  password: string;
  id: string;
}

/** Un navigateur neuf, qui note si le callback de l'application a été demandé. */
interface LoginSession {
  context: BrowserContext;
  page: Page;
  callbackRequested: () => boolean;
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
    browser = await chromium.launch({ args: [UNRESOLVABLE_APPLICATION_HOST] });
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

  async function openLoginSession(): Promise<LoginSession> {
    const context = await browser.newContext();
    let callbackRequested = false;
    context.on('request', (request) => {
      if (request.url().startsWith(REDIRECT_URI)) {
        callbackRequested = true;
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    return { context, page, callbackRequested: () => callbackRequested };
  }

  async function deleteTotpCredentials(userId: string): Promise<void> {
    const credentials = (await (await admin(`/users/${userId}/credentials`)).json()) as {
      id: string;
      type: string;
    }[];
    const totpCredentials = credentials.filter((credential) => credential.type === 'otp');
    expect(totpCredentials).toHaveLength(1);
    for (const credential of totpCredentials) {
      const response = await admin(`/users/${userId}/credentials/${credential.id}`, {
        method: 'DELETE',
      });
      expect(response.status).toBe(204);
    }
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

  /**
   * Envoie un formulaire que Keycloak doit refuser, et rend le statut de sa réponse : 200 quand il
   * réaffiche le formulaire avec une erreur. Attendre cette réponse évite de conclure trop tôt.
   */
  async function submitRefusedForm(page: Page, submitButton: string): Promise<number> {
    const answer = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/login-actions/'),
    );
    await page.locator(submitButton).click();
    return (await answer).status();
  }

  /** Attend la page d'enrôlement TOTP imposée par Keycloak et rend le secret affiché. */
  async function readImposedTotpSecret(session: LoginSession): Promise<string> {
    try {
      await session.page.locator('#mode-manual').click();
    } catch (error) {
      throw new Error(
        `Enrôlement TOTP non imposé ; callback demandé : ${session.callbackRequested()}.\n${String(error)}`,
      );
    }
    expect(session.callbackRequested()).toBe(false);
    return (await session.page.locator('#kc-totp-secret-key').innerText()).trim();
  }

  /** Enrôle le secret affiché et rend l'URL du callback qui suit. */
  async function enrolTotp(page: Page, secret: string): Promise<string> {
    await page.locator('#totp').fill(totpCode(secret, currentSeconds()));
    await page.locator('#userLabel').fill('Test');
    return submitAndCaptureCallback(page, () => page.locator('#saveTOTPBtn').click());
  }

  /**
   * Soumet le formulaire et rend l'URL du callback demandée par le navigateur, code compris. La
   * page du callback n'est pas chargée : le nom du staging n'a pas encore d'enregistrement DNS.
   */
  async function submitAndCaptureCallback(
    page: Page,
    submit: () => Promise<void>,
  ): Promise<string> {
    const callbackRequest = page.waitForRequest(
      (request) => request.url().startsWith(REDIRECT_URI),
      {
        timeout: 20_000,
      },
    );
    await submit();
    try {
      return (await callbackRequest).url();
    } catch (error) {
      const text = (await page.locator('body').innerText()).slice(0, 800);
      throw new Error(
        `Callback non demandé. URL : ${page.url()}\nPage : ${text}\n${String(error)}`,
      );
    }
  }

  async function exchangeCode(callbackUrl: string, verifier: string): Promise<string> {
    const code = new URL(callbackUrl).searchParams.get('code') ?? '';
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
    const session = await openLoginSession();
    try {
      const request = authorizationRequest();
      await session.page.goto(request.url);
      await submitPassword(session.page, account.username, account.password);

      enrolledSecret = await readImposedTotpSecret(session);
      const callbackUrl = await enrolTotp(session.page, enrolledSecret);

      const claims = decodeJwt(await exchangeCode(callbackUrl, request.verifier));
      expect(claims).toMatchObject({
        iss: `${keycloak.baseUrl}/realms/${REALM}`,
        organization_id: ORGANIZATION_ID,
        aud: expect.arrayContaining(['trame-api']),
      });
    } finally {
      await session.context.close();
    }
  });

  it('Connexion refusée sans second facteur : un code faux ne donne aucun jeton', async () => {
    const session = await openLoginSession();
    try {
      const page = session.page;
      const request = authorizationRequest();
      await page.goto(request.url);
      await submitPassword(page, account.username, account.password);

      await page.locator('#otp').fill('000000');
      // Keycloak réaffiche la saisie du code : aucune redirection vers l'application.
      expect(await submitRefusedForm(page, '#kc-login')).toBe(200);
      expect(session.callbackRequested()).toBe(false);

      // Le code de l'enrôlement ne se réutilise pas : celui du pas suivant est admis par la
      // fenêtre de tolérance de Keycloak.
      await page.locator('#otp').fill(totpCode(enrolledSecret, currentSeconds() + 30));
      const callbackUrl = await submitAndCaptureCallback(page, () =>
        page.locator('#kc-login').click(),
      );
      expect(await exchangeCode(callbackUrl, request.verifier)).not.toBe('');
    } finally {
      await session.context.close();
    }
  });

  it('Réenrôlement imposé après la suppression du TOTP par l’administration', async () => {
    await deleteTotpCredentials(account.id);
    const session = await openLoginSession();
    try {
      const request = authorizationRequest();
      await session.page.goto(request.url);
      await submitPassword(session.page, account.username, account.password);

      // Le mot de passe seul ne suffit pas : Keycloak impose un nouveau TOTP avant tout jeton.
      const renewedSecret = await readImposedTotpSecret(session);
      expect(renewedSecret).not.toBe(enrolledSecret);
      const callbackUrl = await enrolTotp(session.page, renewedSecret);

      expect(await exchangeCode(callbackUrl, request.verifier)).not.toBe('');
    } finally {
      await session.context.close();
    }
  });

  it('verrouille temporairement un compte après des échecs répétés', async () => {
    const target: TestAccount = {
      username: 'force-brute',
      password: 'staging-test-bf-' + process.pid,
      id: '',
    };
    target.id = await createAccount(target.username, target.password);
    const session = await openLoginSession();
    try {
      const page = session.page;
      await page.goto(authorizationRequest().url);
      for (let attempt = 0; attempt < 5; attempt++) {
        await page.locator('#username').fill(target.username);
        await page.locator('#password').fill('mauvais-mot-de-passe');
        expect(await submitRefusedForm(page, '#kc-login')).toBe(200);
      }

      const status = await (await admin(`/attack-detection/brute-force/users/${target.id}`)).json();
      expect(status).toMatchObject({ disabled: true });

      // Même le bon mot de passe est refusé tant que le verrou dure.
      await page.locator('#username').fill(target.username);
      await page.locator('#password').fill(target.password);
      expect(await submitRefusedForm(page, '#kc-login')).toBe(200);
      expect(session.callbackRequested()).toBe(false);
    } finally {
      await session.context.close();
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
