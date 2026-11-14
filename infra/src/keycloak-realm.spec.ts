import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('realm de développement Keycloak (US-020 A2)', () => {
  let realm: Record<string, unknown>;

  beforeAll(async () => {
    realm = JSON.parse(await readFile(join(__dirname, '../keycloak/trame-realm.json'), 'utf8'));
  });

  it('déclare les rôles applicatifs et interdit l’inscription publique', () => {
    expect(realm).toMatchObject({
      realm: 'trame',
      enabled: true,
      registrationAllowed: false,
      roles: { realm: [{ name: 'admin' }, { name: 'manager' }, { name: 'employee' }] },
    });
  });

  it('active uniquement le code avec PKCE pour le client de dev', () => {
    expect(realm['clients']).toContainEqual(
      expect.objectContaining({
        clientId: 'trame-dev',
        defaultClientScopes: ['basic', 'profile', 'roles'],
        publicClient: true,
        standardFlowEnabled: true,
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: false,
        attributes: expect.objectContaining({ 'pkce.code.challenge.method': 'S256' }),
      }),
    );
  });

  it('fournit trois comptes dans l’organisation de démo sans rôle d’administration du realm', () => {
    expect(realm['users']).toEqual(
      ['admin', 'manager', 'employee'].map((role) =>
        expect.objectContaining({
          username: 'dev-' + role,
          realmRoles: [role],
          attributes: { organization_id: ['019a4ac0-0000-7000-8000-000000000001'] },
          clientRoles: { account: ['manage-account', 'view-profile'] },
        }),
      ),
    );
  });

  it('réserve les attributs d’organisation à l’administration du realm', () => {
    const components = realm['components'] as Record<
      string,
      { config: Record<string, string[]> }[]
    >;
    const configuration = components?.['org.keycloak.userprofile.UserProfileProvider']?.[0]?.config;
    const profile = JSON.parse(configuration?.['kc.user.profile.config']?.[0] ?? '{}');

    // Keycloak 26.8.2 représente la désactivation par null, pas par l’enum DISABLED.
    expect(profile).toMatchObject({ unmanagedAttributePolicy: null });
    expect(profile.attributes).toContainEqual(
      expect.objectContaining({
        name: 'organization_id',
        permissions: { view: ['admin'], edit: ['admin'] },
      }),
    );
  });
});

/**
 * Depuis Keycloak 26.8.2, l'API d'administration n'accepte qu'un jeton qui porte le scope
 * kc-admin-api. Aucun client de l'application ne doit le recevoir : son jeton reste alors refusé
 * par cette API, quel que soit le rôle applicatif de l'utilisateur, `admin` compris.
 */
const ADMIN_API_SCOPE = 'kc-admin-api';
/** Client d'administration fourni par Keycloak, sans connexion par mot de passe dans nos realms. */
const KEYCLOAK_ADMIN_CLIENT = 'admin-cli';

interface ClientScopes {
  clientId: string;
  defaultClientScopes?: string[];
  optionalClientScopes?: string[];
}

describe.each([
  ['de développement', '../keycloak/trame-realm.json'],
  ['du staging', '../keycloak/generated/trame-staging-realm.json'],
])('clients applicatifs du realm %s', (_environment, realmFile) => {
  let applicationClients: ClientScopes[];

  beforeAll(async () => {
    const realm = JSON.parse(await readFile(join(__dirname, realmFile), 'utf8')) as {
      clients: ClientScopes[];
    };
    applicationClients = realm.clients.filter(
      (client) => client.clientId !== KEYCLOAK_ADMIN_CLIENT,
    );
  });

  it('ne reçoivent pas le scope de l’API d’administration, ni par défaut ni en option', () => {
    expect(applicationClients.length).toBeGreaterThan(0);
    for (const client of applicationClients) {
      // Des listes explicites : absentes, Keycloak donnerait au client les scopes par défaut du realm.
      expect(client.defaultClientScopes).toBeDefined();
      expect(client.optionalClientScopes).toBeDefined();
      expect(client.defaultClientScopes).not.toContain(ADMIN_API_SCOPE);
      expect(client.optionalClientScopes).not.toContain(ADMIN_API_SCOPE);
    }
  });
});
