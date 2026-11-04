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

    // Keycloak 26.8.1 représente la désactivation par null, pas par l’enum DISABLED.
    expect(profile).toMatchObject({ unmanagedAttributePolicy: null });
    expect(profile.attributes).toContainEqual(
      expect.objectContaining({
        name: 'organization_id',
        permissions: { view: ['admin'], edit: ['admin'] },
      }),
    );
  });
});
