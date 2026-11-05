import { proveDiagnosticProgress } from './lib/diagnostic-proof';
import { chromium, type Browser } from 'playwright';
import { decodeJwt } from 'jose';
import { compose, type ComposeOptions } from './lib/compose';
import {
  type ApiProcess,
  reserveFreePort,
  runPrisma,
  startApi,
  startStack,
  queryDatabase,
} from './lib/dev-stack';
import {
  loginWithPkce,
  exchangeToken,
  startLoginCallback,
  type LoginCallback,
  type KeycloakTokens,
} from './lib/keycloak-login';

const ORGANIZATION_ID = '019a4ac0-0000-7000-8000-000000000001';
const OTHER_ORGANIZATION_ID = '019a4ac0-0000-7000-8000-000000000002';

describe('Keycloak et API construite, avec de vrais jetons (US-020 A2)', () => {
  let options: ComposeOptions;
  let issuer: string;
  let databaseUrl: string;
  let api: ApiProcess | undefined;
  let browser: Browser | undefined;
  let callback: LoginCallback | undefined;
  const tokens = new Map<string, KeycloakTokens>();

  beforeAll(async () => {
    callback = await startLoginCallback();
    const databasePort = await reserveFreePort();
    const keycloakPort = await reserveFreePort();
    options = {
      projectName: 'trame-oidc-integration-' + process.pid,
      overrides: {
        POSTGRES_PORT: String(databasePort),
        KEYCLOAK_PORT: String(keycloakPort),
        KEYCLOAK_DEV_REDIRECT_URI: callback.redirectUri,
        RABBITMQ_PORT: String(await reserveFreePort()),
        RABBITMQ_MANAGEMENT_PORT: String(await reserveFreePort()),
      },
    };
    databaseUrl = 'postgresql://trame:trame@127.0.0.1:' + databasePort + '/trame';
    issuer = 'http://127.0.0.1:' + keycloakPort + '/realms/trame';
    await startStack(options);
    await runPrisma(['migrate', 'deploy'], databaseUrl);
    api = await startApi(await reserveFreePort(), databaseUrl, issuer);
    browser = await chromium.launch();
    for (const role of ['admin', 'manager', 'employee']) {
      tokens.set(role, await loginWithPkce(browser, issuer, 'dev-' + role, callback.redirectUri));
    }
  });

  afterAll(async () => {
    await browser?.close();
    await api?.stop();
    await callback?.stop();
    if (options) await compose(['down', '--volumes'], options);
  });

  function accessToken(role: string): string {
    const token = tokens.get(role);
    if (!token) throw new Error('Jeton de test absent : ' + role);
    return token.access_token;
  }

  function request(path: string, role: string, init: RequestInit = {}) {
    return fetch(api?.baseUrl + path, {
      ...init,
      headers: { authorization: 'Bearer ' + accessToken(role), 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  }

  it.each(['admin', 'manager', 'employee'])(
    'obtient un jeton signé pour le compte %s via code + PKCE',
    (role) => {
      const payload = decodeJwt(accessToken(role));
      expect(typeof payload.sub).toBe('string');
      expect(payload.iss).toBe(issuer);
      expect(payload).toMatchObject({ organization_id: ORGANIZATION_ID, typ: 'Bearer' });
      expect(payload.aud).toContain('trame-api');
      expect(payload['roles']).toContain(role);
    },
  );

  it('crée un site dans l’organisation portée par le vrai jeton admin', async () => {
    const response = await request('/sites', 'admin', {
      method: 'POST',
      body: JSON.stringify({ code: 'OIDC-01', name: 'Site OIDC', timeZone: 'Europe/Paris' }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ code: 'OIDC-01' });
    // Le DTO public ne contient pas l'organisation : on vérifie l'écriture réelle.
    expect(
      await queryDatabase(
        databaseUrl,
        "SELECT organization_id::text FROM organization.sites WHERE code = 'OIDC-01'",
      ),
    ).toEqual([{ organization_id: ORGANIZATION_ID }]);
  });

  it('autorise la lecture au manager et refuse la création au manager et à l’employé', async () => {
    expect((await request('/sites', 'manager')).status).toBe(200);
    for (const role of ['manager', 'employee']) {
      const response = await request('/sites', role, {
        method: 'POST',
        body: JSON.stringify({ code: 'FORBIDDEN', name: 'Refusé', timeZone: 'Europe/Paris' }),
      });
      expect(response.status).toBe(403);
      expect(response.headers.get('content-type')).toContain('application/problem+json');
    }
  });

  it('répond 401 sans jeton et avec un ID token', async () => {
    const anonymous = await fetch(api?.baseUrl + '/sites');
    const identityToken = await fetch(api?.baseUrl + '/sites', {
      headers: { authorization: 'Bearer ' + tokens.get('admin')?.id_token },
    });
    for (const response of [anonymous, identityToken]) {
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer');
    }
  });

  it('ne révèle pas le site d’une autre organisation', async () => {
    const id = '019a4ac0-0000-7000-8000-000000000010';
    await queryDatabase(
      databaseUrl,
      "INSERT INTO organization.sites (id, organization_id, code, name, time_zone, created_at) VALUES ('" +
        id +
        "', '" +
        OTHER_ORGANIZATION_ID +
        "', 'OTHER-01', 'Autre site', 'Europe/Paris', CURRENT_TIMESTAMP)",
    );
    expect((await request('/sites/' + id, 'admin')).status).toBe(404);
  });

  it('suit le vrai calcul Python puis reprend après une déconnexion avec le jeton Keycloak', async () => {
    if (api === undefined) throw new Error('API absente');
    await proveDiagnosticProgress({
      baseUrl: api.baseUrl,
      accessToken: accessToken('manager'),
      databaseUrl,
      amqpUrl: 'amqp://trame:trame@127.0.0.1:' + options.overrides?.['RABBITMQ_PORT'],
    });
  });

  it('refuse toute administration du realm avec le rôle applicatif admin', async () => {
    const base = issuer.slice(0, issuer.indexOf('/realms/'));
    const response = await fetch(base + '/admin/realms/trame/users', {
      headers: { authorization: 'Bearer ' + accessToken('admin') },
    });
    expect(response.status).toBe(403);
  });

  it('refuse que l’employé s’attribue un rôle du realm', async () => {
    const base = issuer.slice(0, issuer.indexOf('/realms/'));
    const subject = decodeJwt(accessToken('employee')).sub;
    const response = await fetch(
      base + '/admin/realms/trame/users/' + subject + '/role-mappings/realm',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + accessToken('employee'),
          'content-type': 'application/json',
        },
        body: JSON.stringify([{ name: 'admin' }]),
      },
    );
    expect(response.status).toBe(403);
  });

  it.each(['trame-dev', 'admin-cli'])(
    'refuse le password grant sur le client %s',
    async (clientId) => {
      const response = await fetch(issuer + '/protocol/openid-connect/token', {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: clientId,
          username: 'dev-employee',
          password: 'trame-local-only',
        }),
      });
      expect([400, 401]).toContain(response.status);
    },
  );

  it('garde organisation et rôles après une tentative de modification du profil', async () => {
    const authorization = { authorization: 'Bearer ' + accessToken('employee') };
    const profile = await fetch(issuer + '/account/', {
      headers: { ...authorization, accept: 'application/json' },
    });
    expect(profile.status).toBe(200);
    const response = await fetch(issuer + '/account/', {
      method: 'POST',
      headers: { ...authorization, 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'dev-employee',
        attributes: {
          organization_id: [OTHER_ORGANIZATION_ID],
        },
      }),
    });
    expect([400, 403]).toContain(response.status);
    const refreshed = await exchangeToken(issuer, {
      client_id: 'trame-dev',
      grant_type: 'refresh_token',
      refresh_token: tokens.get('employee')?.refresh_token ?? '',
    });
    const payload = decodeJwt(refreshed.access_token);
    expect(payload['organization_id']).toBe(ORGANIZATION_ID);
    expect(payload['roles']).toContain('employee');
    expect(payload['roles']).not.toContain('admin');
  });
});
