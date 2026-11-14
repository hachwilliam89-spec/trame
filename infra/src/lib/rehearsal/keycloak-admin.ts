/** Un compte à créer par l'administration, comme le runbook crée celui d'un utilisateur. */
export interface NewAccount {
  username: string;
  email: string;
  /** À changer à la première connexion. */
  temporaryPassword: string;
  organizationId: string;
  realmRole: string;
}

interface RoleRepresentation {
  id: string;
  name: string;
}

const REQUEST_TIMEOUT_MILLISECONDS = 15_000;

/**
 * L'API d'administration de Keycloak, jointe par le tunnel avec le compte d'administration : la
 * seule voie d'administration, puisque Traefik ne route ni /admin/ ni le realm master.
 */
export class KeycloakAdminApi {
  constructor(
    private readonly adminUrl: string,
    private readonly credentials: { username: string; password: string },
  ) {}

  /** Crée le compte avec un mot de passe temporaire, puis lui donne son rôle. */
  async createAccount(realm: string, account: NewAccount): Promise<void> {
    const created = await this.request('POST', `/admin/realms/${realm}/users`, {
      username: account.username,
      enabled: true,
      email: account.email,
      emailVerified: true,
      firstName: 'Compte',
      lastName: 'Répétition',
      attributes: { organization_id: [account.organizationId] },
      credentials: [{ type: 'password', value: account.temporaryPassword, temporary: true }],
    });
    const accountId = created.headers.get('location')?.split('/').pop() ?? '';
    const role = (await (
      await this.request('GET', `/admin/realms/${realm}/roles/${account.realmRole}`)
    ).json()) as RoleRepresentation;
    await this.request('POST', `/admin/realms/${realm}/users/${accountId}/role-mappings/realm`, [
      { id: role.id, name: role.name },
    ]);
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${await this.token()}` };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${this.adminUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
    if (!response.ok) {
      throw new Error(
        `Administration de Keycloak : ${method} ${path} a répondu ${String(response.status)}.`,
      );
    }
    return response;
  }

  private async token(): Promise<string> {
    const response = await fetch(`${this.adminUrl}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: this.credentials.username,
        password: this.credentials.password,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
    if (!response.ok) {
      throw new Error(`Jeton d’administration refusé : HTTP ${String(response.status)}.`);
    }
    const body = (await response.json()) as { access_token: string };
    return body.access_token;
  }
}
