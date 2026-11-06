import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  APPLICATION_CLIENT_ID,
  DEPLOYED_REALMS,
  type RealmRepresentation,
  buildEnvironmentRealm,
  serializeRealm,
} from './lib/environment-realm';

const STAGING = {
  realmName: 'trame-staging',
  displayName: 'Trame — staging',
  applicationOrigin: 'https://staging.trame.wkhach.dev',
};

interface ClientRepresentation {
  clientId: string;
  enabled: boolean;
  redirectUris?: string[];
  webOrigins?: string[];
  implicitFlowEnabled?: boolean;
  directAccessGrantsEnabled?: boolean;
  attributes?: Record<string, string>;
}

function clients(realm: RealmRepresentation): ClientRepresentation[] {
  return realm['clients'] as ClientRepresentation[];
}

function applicationClient(realm: RealmRepresentation): ClientRepresentation {
  const client = clients(realm).find((candidate) => candidate.clientId === APPLICATION_CLIENT_ID);
  if (client === undefined) throw new Error('Client applicatif absent.');
  return client;
}

describe('realm d’environnement dérivé du realm local (US-005 B2)', () => {
  let localRealm: RealmRepresentation;
  let staging: RealmRepresentation;

  beforeAll(async () => {
    const path = join(__dirname, '../keycloak/trame-realm.json');
    localRealm = JSON.parse(await readFile(path, 'utf8'));
    staging = buildEnvironmentRealm(localRealm, STAGING);
  });

  it('porte le nom du realm, donc son émetteur, et son libellé', () => {
    expect(staging).toMatchObject({
      realm: 'trame-staging',
      displayName: 'Trame — staging',
      enabled: true,
    });
  });

  it('ne contient aucun compte de développement, ni aucun utilisateur', () => {
    expect(staging['users']).toBeUndefined();
  });

  it('ne contient ni adresse locale, ni variable du realm local, ni mot de passe', () => {
    const text = JSON.stringify(staging);

    expect(text).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(text).not.toMatch(/KEYCLOAK_DEV/);
    expect(text).not.toMatch(/"(password|secret|credentials|value)"\s*:/);
    expect(text).not.toContain('trame-local-only');
  });

  it('ne garde aucune référence au client local, associations de portée comprises', () => {
    // Keycloak refuse d'importer un realm dont une association vise un client absent.
    expect(JSON.stringify(staging)).not.toContain('trame-dev');
  });

  it('expose un seul client applicatif, avec callback et origine HTTPS exacts', () => {
    expect(applicationClient(staging)).toMatchObject({
      enabled: true,
      redirectUris: ['https://staging.trame.wkhach.dev/oidc-callback'],
      webOrigins: ['https://staging.trame.wkhach.dev'],
    });
    expect(clients(staging).map((client) => client.clientId)).not.toContain('trame-dev');
  });

  it('garde le code avec PKCE S256 seul : ni flux implicite, ni password grant', () => {
    expect(applicationClient(staging)).toMatchObject({
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      attributes: expect.objectContaining({ 'pkce.code.challenge.method': 'S256' }),
    });
  });

  it('garde admin-cli désactivé', () => {
    expect(clients(staging)).toContainEqual(
      expect.objectContaining({ clientId: 'admin-cli', enabled: false }),
    );
  });

  it('ferme l’inscription et exige TLS pour toute requête externe', () => {
    expect(staging).toMatchObject({ registrationAllowed: false, sslRequired: 'external' });
  });

  it('active la détection de force brute', () => {
    expect(staging).toMatchObject({ bruteForceProtected: true, permanentLockout: false });
    expect(staging['failureFactor']).toBeGreaterThan(0);
  });

  it('impose l’enrôlement d’un TOTP à tout nouveau compte', () => {
    expect(staging['requiredActions']).toContainEqual(
      expect.objectContaining({ alias: 'CONFIGURE_TOTP', enabled: true, defaultAction: true }),
    );
    // Un compte créé par l'administration reçoit un mot de passe temporaire, à changer.
    expect(staging['requiredActions']).toContainEqual(
      expect.objectContaining({ alias: 'UPDATE_PASSWORD', enabled: true, defaultAction: false }),
    );
  });

  it('garde les rôles, les mappers et la protection de l’organisation du realm local', () => {
    expect(staging['roles']).toEqual(localRealm['roles']);
    expect(staging['components']).toEqual(localRealm['components']);
    const localClient = clients(localRealm).find((client) => client.clientId === 'trame-dev');
    expect(applicationClient(staging)).toMatchObject({
      protocolMappers: (localClient as RealmRepresentation | undefined)?.['protocolMappers'],
    });
  });

  it('refuse une origine qui n’est pas HTTPS ou qui a un chemin', () => {
    for (const applicationOrigin of [
      'http://staging.trame.wkhach.dev',
      'https://staging.trame.wkhach.dev/app',
    ]) {
      expect(() => buildEnvironmentRealm(localRealm, { ...STAGING, applicationOrigin })).toThrow(
        `Origine d’application invalide : ${applicationOrigin}`,
      );
    }
  });

  it('ne modifie pas le realm local', () => {
    expect(localRealm['realm']).toBe('trame');
    expect(localRealm['users']).toHaveLength(3);
  });
});

describe('realms déployés versionnés', () => {
  it.each(Object.values(DEPLOYED_REALMS))(
    'le fichier de $realmName est celui que produit le générateur',
    async (environment) => {
      const keycloakDirectory = join(__dirname, '../keycloak');
      const localRealm = JSON.parse(
        await readFile(join(keycloakDirectory, 'trame-realm.json'), 'utf8'),
      );
      const committed = await readFile(
        join(keycloakDirectory, 'generated', `${environment.realmName}-realm.json`),
        'utf8',
      );

      // Un écart se corrige par `pnpm nx run infra:realms-generate`, jamais à la main.
      expect(committed).toBe(serializeRealm(buildEnvironmentRealm(localRealm, environment)));
    },
  );
});
