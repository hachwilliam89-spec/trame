import { FixedClock } from '@trame/platform/clock';
import type { Request } from 'express';
import { type CryptoKey, type JWK, SignJWT, UnsecuredJWT, exportJWK, generateKeyPair } from 'jose';
import { IdentityProviderUnavailableError } from '../identity-provider-unavailable.error';
import { JwksTestServer } from './jwks-test-server';
import { type OidcActorResolverOptions, createOidcActorResolver } from './oidc-actor-resolver';

const ISSUER = 'https://idp.test/realms/trame';
const AUDIENCE = 'trame-api';
const ORGANIZATION_ID = '0192f3a4-7b8c-7d10-8e2f-3a4b5c6d7e8f';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// 2020 : un jeton valide à cette date est expiré pour l'horloge du système. S'il est accepté,
// c'est bien le port Clock qui date la vérification.
const NOW = '2020-01-01T10:00:00Z';
const NOW_IN_SECONDS = Temporal.Instant.from(NOW).epochMilliseconds / 1000;

interface SigningKey {
  kid: string;
  alg: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
}

async function signingKey(kid: string, alg = 'RS256'): Promise<SigningKey> {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), kid, alg, use: 'sig' };
  return { kid, alg, privateKey, publicJwk };
}

/** Jeton d'accès conforme, modifiable revendication par revendication. */
async function accessToken(
  key: SigningKey,
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
): Promise<string> {
  const payload: Record<string, unknown> = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: 'utilisateur-opaque-1',
    iat: NOW_IN_SECONDS,
    exp: NOW_IN_SECONDS + 300,
    typ: 'Bearer',
    organization_id: ORGANIZATION_ID,
    roles: ['admin', 'offline_access'],
    ...claims,
  };
  for (const [name, value] of Object.entries(payload)) {
    if (value === undefined) {
      delete payload[name];
    }
  }
  return new SignJWT(payload)
    .setProtectedHeader({ alg: key.alg, kid: key.kid, ...header })
    .sign(key.privateKey);
}

function requestWithAuthorization(authorization?: string): Request {
  const headers = authorization === undefined ? {} : { authorization };
  return { headers } as Request;
}

describe('createOidcActorResolver', () => {
  let jwks: JwksTestServer;
  let firstKey: SigningKey;
  let clock: FixedClock;

  function options(overrides: Partial<OidcActorResolverOptions> = {}): OidcActorResolverOptions {
    return {
      issuer: ISSUER,
      audience: AUDIENCE,
      jwksUrl: jwks.url,
      clock,
      claims: {
        organization: 'organization_id',
        roles: 'roles',
        tokenType: { name: 'typ', value: 'Bearer' },
      },
      knownRoles: ['admin', 'manager', 'employee'],
      isOrganizationId: (value) => UUID.test(value),
      jwksFetch: { timeoutMs: 300, cooldownMs: 0 },
      ...overrides,
    };
  }

  async function actorFor(token: string, resolverOptions = options()) {
    return createOidcActorResolver(resolverOptions)(requestWithAuthorization(`Bearer ${token}`));
  }

  beforeAll(async () => {
    firstKey = await signingKey('cle-1');
  });

  beforeEach(async () => {
    clock = new FixedClock(NOW);
    jwks = await JwksTestServer.start([firstKey.publicJwk]);
  });

  afterEach(async () => {
    await jwks.close();
  });

  it("reconnaît un jeton d'accès valide, et ne garde que les rôles connus", async () => {
    const actor = await actorFor(await accessToken(firstKey));

    expect(actor).toEqual({
      userId: 'utilisateur-opaque-1',
      organizationId: ORGANIZATION_ID,
      roles: ['admin'],
      expiresAtEpochMilliseconds: (NOW_IN_SECONDS + 300) * 1000,
    });
  });

  it("date la vérification avec le port Clock, pas avec l'horloge du système", async () => {
    const token = await accessToken(firstKey);
    expect(await actorFor(token)).toBeDefined();

    clock.advance({ minutes: 10 });

    expect(await actorFor(token)).toBeUndefined();
  });

  it.each([
    { label: 'expiré', claims: { exp: NOW_IN_SECONDS - 1 } },
    { label: 'pas encore valide (nbf dans le futur)', claims: { nbf: NOW_IN_SECONDS + 60 } },
    { label: 'sans exp', claims: { exp: undefined } },
    { label: 'sans sub', claims: { sub: undefined } },
    { label: "d'un autre émetteur", claims: { iss: 'https://autre-idp.test/realms/trame' } },
    { label: 'destiné à une autre audience', claims: { aud: 'autre-api' } },
    { label: 'qui est un ID token', claims: { typ: 'ID' } },
    { label: 'sans organisation', claims: { organization_id: undefined } },
    { label: 'avec une organisation mal formée', claims: { organization_id: 'org-a' } },
    { label: "avec une organisation qui n'est pas une chaîne", claims: { organization_id: 42 } },
    { label: 'avec des rôles qui ne sont pas une liste', claims: { roles: 'admin' } },
    { label: 'avec des rôles qui ne sont pas des chaînes', claims: { roles: ['admin', 7] } },
  ])('refuse un jeton $label', async ({ claims }) => {
    expect(await actorFor(await accessToken(firstKey, claims))).toBeUndefined();
  });

  it('refuse un jeton signé par une autre clé que celle publiée', async () => {
    const impostor = await signingKey('cle-1');

    expect(await actorFor(await accessToken(impostor))).toBeUndefined();
  });

  it('refuse un autre algorithme que RS256, même publié dans le JWKS', async () => {
    const ellipticKey = await signingKey('cle-es', 'ES256');
    jwks.publish([firstKey.publicJwk, ellipticKey.publicJwk]);

    expect(await actorFor(await accessToken(ellipticKey))).toBeUndefined();
  });

  it('refuse un jeton non signé (alg none)', async () => {
    const unsigned = new UnsecuredJWT({ iss: ISSUER, aud: AUDIENCE, sub: 'u', typ: 'Bearer' })
      .setExpirationTime(NOW_IN_SECONDS + 300)
      .encode();

    expect(await actorFor(unsigned)).toBeUndefined();
  });

  it.each([
    { label: 'sans en-tête Authorization', authorization: undefined },
    { label: 'avec un autre schéma que Bearer', authorization: 'Basic dXNlcjpwYXNz' },
    { label: 'avec un en-tête Bearer vide', authorization: 'Bearer ' },
    { label: "avec un jeton qui n'est pas un JWT", authorization: 'Bearer pas-un-jwt' },
  ])('ne reconnaît personne $label', async ({ authorization }) => {
    const resolve = createOidcActorResolver(options());

    expect(await resolve(requestWithAuthorization(authorization))).toBeUndefined();
  });

  it("ignore l'adresse de clés indiquée par le jeton (jku) : seule la configuration fait foi", async () => {
    const attackerKey = await signingKey('cle-attaquant');
    const attackerJwks = await JwksTestServer.start([attackerKey.publicJwk]);
    try {
      const token = await accessToken(attackerKey, {}, { jku: attackerJwks.url.href });

      expect(await actorFor(token)).toBeUndefined();
      expect(attackerJwks.requestCount).toBe(0);
    } finally {
      await attackerJwks.close();
    }
  });

  it('suit une rotation de clé, sans télécharger le JWKS à chaque requête', async () => {
    const resolve = createOidcActorResolver(options());
    const firstToken = await accessToken(firstKey);
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await resolve(requestWithAuthorization(`Bearer ${firstToken}`))).toBeDefined();
    }
    expect(jwks.requestCount).toBe(1);

    const secondKey = await signingKey('cle-2');
    jwks.publish([firstKey.publicJwk, secondKey.publicJwk]);
    const rotatedToken = await accessToken(secondKey);

    expect(await resolve(requestWithAuthorization(`Bearer ${rotatedToken}`))).toBeDefined();
    expect(jwks.requestCount).toBe(2);
  });

  it("signale le fournisseur indisponible quand le JWKS dépasse le délai, sans accorder l'accès", async () => {
    jwks.respondAfter(1_000);

    await expect(actorFor(await accessToken(firstKey))).rejects.toBeInstanceOf(
      IdentityProviderUnavailableError,
    );
  });

  it('signale le fournisseur indisponible quand le JWKS répond en erreur', async () => {
    jwks.respondWithStatus(500);

    await expect(actorFor(await accessToken(firstKey))).rejects.toBeInstanceOf(
      IdentityProviderUnavailableError,
    );
  });
});
