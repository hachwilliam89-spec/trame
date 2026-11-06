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

interface FlowExecution {
  authenticator?: string;
  authenticatorFlow: boolean;
  flowAlias?: string;
  requirement: string;
  priority: number;
}

interface FlowRepresentation {
  alias: string;
  topLevel: boolean;
  authenticationExecutions: FlowExecution[];
}

function flows(realm: RealmRepresentation): FlowRepresentation[] {
  return (realm['authenticationFlows'] ?? []) as FlowRepresentation[];
}

function flowByAlias(realm: RealmRepresentation, alias: unknown): FlowRepresentation {
  const flow = flows(realm).find((candidate) => candidate.alias === alias);
  if (flow === undefined) throw new Error(`Flux absent : ${String(alias)}`);
  return flow;
}

/** Les étapes d'un flux, dans l'ordre : « exécution exigence » ou « flux:alias exigence ». */
function steps(flow: FlowRepresentation): string[] {
  const executions = [...flow.authenticationExecutions].sort(
    (first, second) => first.priority - second.priority,
  );
  const descriptions: string[] = [];
  for (const execution of executions) {
    const target = execution.authenticatorFlow
      ? `flux:${execution.flowAlias}`
      : execution.authenticator;
    descriptions.push(`${target} ${execution.requirement}`);
  }
  return descriptions;
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

  it('ferme la réinitialisation du mot de passe par e-mail, même si le realm local l’ouvre', () => {
    // Le flux de réinitialisation de Keycloak ne demande l'OTP que s'il est déjà enrôlé.
    const openLocalRealm = { ...localRealm, resetPasswordAllowed: true };

    expect(buildEnvironmentRealm(openLocalRealm, STAGING)).toMatchObject({
      resetPasswordAllowed: false,
    });
  });

  it('active la détection de force brute', () => {
    expect(staging).toMatchObject({ bruteForceProtected: true, permanentLockout: false });
    expect(staging['failureFactor']).toBeGreaterThan(0);
  });

  it('connecte par navigateur avec le mot de passe puis le TOTP, sans condition', () => {
    const browserFlow = flowByAlias(staging, staging['browserFlow']);
    const formsAlias = browserFlow.authenticationExecutions.find(
      (execution) => execution.authenticatorFlow,
    )?.flowAlias;

    expect(browserFlow.topLevel).toBe(true);
    expect(steps(browserFlow)).toEqual([
      'auth-cookie ALTERNATIVE',
      `flux:${formsAlias} ALTERNATIVE`,
    ]);
    expect(steps(flowByAlias(staging, formsAlias))).toEqual([
      'auth-username-password-form REQUIRED',
      'auth-otp-form REQUIRED',
    ]);
  });

  it('nomme ses flux sans reprendre un alias des flux que Keycloak crée par défaut', () => {
    // Keycloak complète à l'import les flux par défaut absents : un alias commun les mélangerait.
    expect(flows(staging).length).toBeGreaterThan(0);
    for (const flow of flows(staging)) {
      expect(flow.alias).toMatch(/^trame /);
    }
  });

  it('garde actives les actions dont dépendent l’enrôlement du TOTP et le premier accès', () => {
    // Sans CONFIGURE_TOTP active, l'OTP exigé échouerait au lieu de faire enrôler un nouveau TOTP.
    expect(staging['requiredActions']).toContainEqual(
      expect.objectContaining({ alias: 'CONFIGURE_TOTP', enabled: true }),
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
