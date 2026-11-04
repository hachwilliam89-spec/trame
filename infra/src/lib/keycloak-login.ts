import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Browser } from 'playwright';
import { z } from 'zod';

export interface LoginCallback {
  redirectUri: string;
  stop(): Promise<void>;
}

/** Un vrai callback HTTP sur port libre ; aucun jeton n'est stocké ni affiché. */
export async function startLoginCallback(): Promise<LoginCallback> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>Callback OIDC de test</title>Connexion reçue.');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Port du callback absent.');
  return {
    redirectUri: 'http://127.0.0.1:' + address.port + '/oidc-callback',
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

const tokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  id_token: z.string(),
});
export type KeycloakTokens = z.infer<typeof tokensSchema>;

/** Teste la vraie page de connexion ; seul le callback de l'application est simulé. */
export async function loginWithPkce(
  browser: Browser,
  issuer: string,
  username: string,
  redirectUri: string,
): Promise<KeycloakTokens> {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomUUID();
  const url = new URL(issuer + '/protocol/openid-connect/auth');
  url.search = new URLSearchParams({
    client_id: 'trame-dev',
    response_type: 'code',
    scope: 'openid',
    redirect_uri: redirectUri,
    state,
    nonce: randomUUID(),
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString();

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto(url.toString());
    await page.locator('#username').fill(username);
    await page.locator('#password').fill('trame-local-only');
    await page.locator('#kc-login').click();
    await page.waitForURL((target) => target.origin + target.pathname === redirectUri);
    const callback = new URL(page.url());
    const code = callback.searchParams.get('code');
    if (!code || callback.searchParams.get('state') !== state) {
      throw new Error('Callback OIDC invalide.');
    }
    return await exchangeToken(issuer, {
      grant_type: 'authorization_code',
      client_id: 'trame-dev',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
  } finally {
    await context.close();
  }
}

export async function exchangeToken(
  issuer: string,
  parameters: Record<string, string>,
): Promise<KeycloakTokens> {
  const response = await fetch(issuer + '/protocol/openid-connect/token', {
    method: 'POST',
    body: new URLSearchParams(parameters),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Échange du jeton refusé : HTTP ' + response.status);
  return tokensSchema.parse(await response.json());
}
