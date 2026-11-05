import Keycloak from 'keycloak-js';
import * as z from 'zod';
import type { IdentityDriver, WebIdentity } from './session';

export const webConfiguration = z.object({
  apiBasePath: z.literal('/api/v1'),
  authServerUrl: z.url(),
  realm: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  clientId: z.string().min(1).max(120),
});
export type WebConfiguration = z.infer<typeof webConfiguration>;
const identityClaims = z.object({
  sub: z.string().min(1),
  organization_id: z.uuid(),
  roles: z.array(z.string()),
});

/** Le SDK gère state, nonce, vérificateur PKCE et jetons ; le front ne les persiste pas. */
export class KeycloakDriver implements IdentityDriver {
  onExpired: () => void = () => undefined;
  private readonly keycloak: Keycloak;
  constructor(
    configuration: WebConfiguration,
    private readonly redirectUri: string,
  ) {
    this.keycloak = new Keycloak({
      url: configuration.authServerUrl,
      realm: configuration.realm,
      clientId: configuration.clientId,
    });
    this.keycloak.onTokenExpired = () => this.onExpired();
    this.keycloak.onAuthLogout = () => this.onExpired();
  }
  initialize(): Promise<boolean> {
    return this.keycloak.init({
      pkceMethod: 'S256',
      flow: 'standard',
      responseMode: 'fragment',
      checkLoginIframe: false,
    });
  }
  identity(): WebIdentity | undefined {
    const claims = identityClaims.safeParse(this.keycloak.tokenParsed);
    if (!claims.success) return undefined;
    return {
      subject: claims.data.sub,
      organizationId: claims.data.organization_id,
      roles: claims.data.roles,
    };
  }
  async accessToken(): Promise<string> {
    await this.keycloak.updateToken(10);
    const token = this.keycloak.token;
    if (token === undefined) throw new Error('Session absente');
    return token;
  }
  login(): Promise<void> {
    return this.keycloak.login({ redirectUri: this.redirectUri });
  }
  logout(): Promise<void> {
    return this.keycloak.logout({ redirectUri: this.redirectUri });
  }
}

export async function loadWebConfiguration(): Promise<WebConfiguration> {
  const response = await fetch('/config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Configuration indisponible');
  const configuration = webConfiguration.parse(await response.json());
  const authority = new URL(configuration.authServerUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(authority.hostname);
  if (
    authority.username ||
    authority.password ||
    authority.search ||
    authority.hash ||
    (authority.protocol !== 'https:' && !(authority.protocol === 'http:' && local))
  ) {
    throw new Error('Configuration invalide');
  }
  return configuration;
}
