import type { Clock } from '@trame/platform/clock';
import type { Request } from 'express';
import { type JWTPayload, createRemoteJWKSet, errors, jwtVerify } from 'jose';
import type { Actor, ActorResolver } from '../actor';
import { IdentityProviderUnavailableError } from '../identity-provider-unavailable.error';

export interface OidcClaimNames {
  /** Revendication qui porte l'organisation de l'utilisateur. */
  organization: string;
  /** Revendication qui porte ses rôles, en liste de chaînes. */
  roles: string;
  /**
   * Revendication qui distingue un jeton d'accès d'un ID token, et sa valeur pour un jeton d'accès
   * (Keycloak : `typ` vaut `Bearer`, contre `ID` pour un ID token).
   */
  tokenType: { name: string; value: string };
}

export interface OidcActorResolverOptions {
  issuer: string;
  audience: string;
  /** Adresse des clés publiques : celle de la configuration, jamais celle indiquée par un jeton. */
  jwksUrl: URL;
  /** Date de vérification de `exp` et `nbf`. Le cache des clés garde sa propre horloge. */
  clock: Clock;
  claims: OidcClaimNames;
  /** Rôles de l'application. Les autres rôles du jeton (ceux du fournisseur) sont ignorés. */
  knownRoles: readonly string[];
  /** Format attendu d'un identifiant d'organisation. Un autre format refuse le jeton. */
  isOrganizationId: (value: string) => boolean;
  jwksFetch?: {
    /** Délai maximal d'un téléchargement du JWKS. */
    timeoutMs?: number;
    /** Délai minimal entre deux téléchargements déclenchés par une clé inconnue. */
    cooldownMs?: number;
  };
}

/** Seule signature acceptée : la clé publique RSA du fournisseur. */
const ACCEPTED_ALGORITHMS = ['RS256'];

/**
 * Erreurs de `jose` qui signifient « ce jeton est refusé ». Toute autre erreur (délai dépassé,
 * JWKS en erreur ou mal formé, réseau) veut dire que la vérification n'a pas pu se faire.
 */
const TOKEN_REJECTION_CODES = new Set([
  errors.JWTExpired.code,
  errors.JWTClaimValidationFailed.code,
  errors.JWTInvalid.code,
  errors.JWSInvalid.code,
  errors.JWSSignatureVerificationFailed.code,
  errors.JOSEAlgNotAllowed.code,
  errors.JOSENotSupported.code,
  errors.JWKSNoMatchingKey.code,
  errors.JWKSMultipleMatchingKeys.code,
]);

/**
 * Reconnaît l'utilisateur à son jeton d'accès OIDC (`Authorization: Bearer …`).
 *
 * Renvoie `undefined` pour tout jeton absent ou refusé, sans en donner le motif. Lève
 * `IdentityProviderUnavailableError` quand les clés publiques sont injoignables : le jeton n'est
 * alors ni accepté ni refusé.
 */
export function createOidcActorResolver(options: OidcActorResolverOptions): ActorResolver {
  const publicKeys = createRemoteJWKSet(options.jwksUrl, {
    timeoutDuration: options.jwksFetch?.timeoutMs,
    cooldownDuration: options.jwksFetch?.cooldownMs,
  });

  return async (request: Request): Promise<Actor | undefined> => {
    const token = bearerTokenOf(request);
    if (token === undefined) {
      return undefined;
    }
    const payload = await verifiedPayload(token, publicKeys, options);
    if (payload === undefined) {
      return undefined;
    }
    return actorFrom(payload, options);
  };
}

function bearerTokenOf(request: Request): string | undefined {
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string') {
    return undefined;
  }
  const [scheme, token, ...rest] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
    return undefined;
  }
  return token;
}

async function verifiedPayload(
  token: string,
  publicKeys: ReturnType<typeof createRemoteJWKSet>,
  options: OidcActorResolverOptions,
): Promise<JWTPayload | undefined> {
  try {
    const { payload } = await jwtVerify(token, publicKeys, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: ACCEPTED_ALGORITHMS,
      // `jose` ne vérifie `exp` que s'il est présent : on l'exige, comme le sujet.
      requiredClaims: ['exp', 'sub'],
      currentDate: new Date(options.clock.now().epochMilliseconds),
    });
    return payload;
  } catch (error) {
    if (isTokenRejection(error)) {
      return undefined;
    }
    throw new IdentityProviderUnavailableError();
  }
}

function isTokenRejection(error: unknown): boolean {
  return error instanceof errors.JOSEError && TOKEN_REJECTION_CODES.has(error.code);
}

/** L'utilisateur décrit par un jeton vérifié, si ses revendications applicatives sont valides. */
function actorFrom(payload: JWTPayload, options: OidcActorResolverOptions): Actor | undefined {
  const { claims } = options;
  if (payload[claims.tokenType.name] !== claims.tokenType.value) {
    return undefined;
  }

  const organizationId = payload[claims.organization];
  if (typeof organizationId !== 'string' || !options.isOrganizationId(organizationId)) {
    return undefined;
  }

  const roles = knownRolesOf(payload[claims.roles], options.knownRoles);
  if (roles === undefined || typeof payload.sub !== 'string' || payload.sub === '') {
    return undefined;
  }

  const expiresAtEpochMilliseconds = Math.floor(Number(payload.exp) * 1000);
  if (!Number.isSafeInteger(expiresAtEpochMilliseconds)) return undefined;
  return { userId: payload.sub, organizationId, roles, expiresAtEpochMilliseconds };
}

/** Les rôles connus de l'application, ou `undefined` si la revendication n'est pas une liste de chaînes. */
function knownRolesOf(value: unknown, knownRoles: readonly string[]): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const roles: string[] = [];
  for (const role of value) {
    if (typeof role !== 'string') {
      return undefined;
    }
    if (knownRoles.includes(role)) {
      roles.push(role);
    }
  }
  return roles;
}
