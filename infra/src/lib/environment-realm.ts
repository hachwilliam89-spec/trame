/** Paramètres d'un realm d'environnement déployé (staging, puis production). */
export interface RealmEnvironment {
  /** Nom du realm, qui fixe l'émetteur : `https://auth.trame.wkhach.dev/realms/<nom>`. */
  realmName: string;
  displayName: string;
  /** Origine HTTPS exacte de l'application, sans chemin. */
  applicationOrigin: string;
}

export type RealmRepresentation = Record<string, unknown>;

/** Realms déployés : le fichier de chacun est généré dans `infra/keycloak/generated/` (`infra:realms-generate`). */
export const DEPLOYED_REALMS: Record<string, RealmEnvironment> = {
  'trame-staging': {
    realmName: 'trame-staging',
    displayName: 'Trame — staging',
    applicationOrigin: 'https://staging.trame.wkhach.dev',
  },
};

/** Le client public de l'application, dans tous les realms déployés. */
export const APPLICATION_CLIENT_ID = 'trame-web';

const LOCAL_CLIENT_ID = 'trame-dev';
const ORIGIN_PATTERN = /^https:\/\/[a-z0-9.-]+$/;

/**
 * Détection de force brute (issue #47) : verrouillage temporaire et croissant, jamais permanent,
 * pour qu'un attaquant ne puisse pas bloquer durablement le compte de Kim.
 */
const BRUTE_FORCE_PROTECTION = {
  bruteForceProtected: true,
  permanentLockout: false,
  failureFactor: 5,
  waitIncrementSeconds: 60,
  maxFailureWaitSeconds: 900,
  maxDeltaTimeSeconds: 43_200,
  quickLoginCheckMilliSeconds: 1000,
  minimumQuickLoginWaitSeconds: 60,
};

/**
 * Actions imposées : tout nouveau compte enrôle un TOTP à sa première connexion (second facteur
 * obligatoire, issue #47). Un compte créé par l'administration reçoit un mot de passe temporaire,
 * d'où la mise à jour du mot de passe, active mais non imposée par défaut.
 */
const REQUIRED_ACTIONS = [
  {
    alias: 'CONFIGURE_TOTP',
    name: 'Configure OTP',
    providerId: 'CONFIGURE_TOTP',
    enabled: true,
    defaultAction: true,
    priority: 10,
    config: {},
  },
  {
    alias: 'UPDATE_PASSWORD',
    name: 'Update Password',
    providerId: 'UPDATE_PASSWORD',
    enabled: true,
    defaultAction: false,
    priority: 30,
    config: {},
  },
];

/**
 * Dérive le realm d'un environnement déployé à partir du realm local : mêmes rôles, mappers et
 * protection de l'organisation, mais sans aucun compte, avec le client `trame-web` limité à
 * l'origine HTTPS de l'environnement, TLS exigé, force brute détectée et TOTP obligatoire.
 */
export function buildEnvironmentRealm(
  localRealm: RealmRepresentation,
  environment: RealmEnvironment,
): RealmRepresentation {
  if (!ORIGIN_PATTERN.test(environment.applicationOrigin)) {
    throw new Error(`Origine d’application invalide : ${environment.applicationOrigin}`);
  }
  // Copie profonde : le realm local reste intact, il sert aussi au poste de développement.
  const realm = structuredClone(localRealm);
  delete realm['users'];
  return {
    ...realm,
    realm: environment.realmName,
    displayName: environment.displayName,
    enabled: true,
    registrationAllowed: false,
    // « external » : TLS exigé hors réseau privé. Derrière Traefik, l'adresse du client vient des
    // en-têtes du proxy ; un réseau Docker interne reste utilisable par les tests.
    sslRequired: 'external',
    ...BRUTE_FORCE_PROTECTION,
    requiredActions: REQUIRED_ACTIONS,
    clients: environmentClients(realm, environment.applicationOrigin),
    scopeMappings: renameClientInMappings(realm['scopeMappings']),
    clientScopeMappings: renameClientInClientScopeMappings(realm['clientScopeMappings']),
  };
}

interface ScopeMapping {
  client?: string;
  roles: string[];
}

/**
 * Les associations de portée désignent le client par son identifiant : Keycloak refuse d'importer
 * un realm dont une association vise un client absent. Elles suivent donc le renommage.
 */
function renameClientInMappings(mappings: unknown): ScopeMapping[] {
  const renamed: ScopeMapping[] = [];
  for (const mapping of (mappings ?? []) as ScopeMapping[]) {
    if (mapping.client === LOCAL_CLIENT_ID) {
      renamed.push({ ...mapping, client: APPLICATION_CLIENT_ID });
    } else {
      renamed.push(mapping);
    }
  }
  return renamed;
}

function renameClientInClientScopeMappings(
  mappingsByClient: unknown,
): Record<string, ScopeMapping[]> {
  const renamed: Record<string, ScopeMapping[]> = {};
  const entries = Object.entries((mappingsByClient ?? {}) as Record<string, ScopeMapping[]>);
  for (const [clientId, mappings] of entries) {
    renamed[clientId] = renameClientInMappings(mappings);
  }
  return renamed;
}

function environmentClients(
  realm: RealmRepresentation,
  applicationOrigin: string,
): RealmRepresentation[] {
  const localClients = realm['clients'] as RealmRepresentation[];
  const environmentClientList: RealmRepresentation[] = [];
  for (const client of localClients) {
    if (client['clientId'] !== LOCAL_CLIENT_ID) {
      environmentClientList.push(client);
      continue;
    }
    environmentClientList.push({
      ...client,
      clientId: APPLICATION_CLIENT_ID,
      name: 'Trame',
      redirectUris: [`${applicationOrigin}/oidc-callback`],
      webOrigins: [applicationOrigin],
    });
  }
  return environmentClientList;
}

/** Format du fichier versionné : stable, pour que le test d'écart compare au caractère près. */
export function serializeRealm(realm: RealmRepresentation): string {
  return `${JSON.stringify(realm, null, 2)}\n`;
}
