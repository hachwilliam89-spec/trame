# `@trame/platform/auth`

Authentification et rôles, indépendants du fournisseur d'identité.

- `AuthModule.forRoot({ resolveActor? })` enregistre `AuthGuard` comme garde globale. Toute route exige un utilisateur, sauf celles marquées `@Public()`.
  - Sans utilisateur : `401` en problem+json, avec l'en-tête `WWW-Authenticate: Bearer` (RFC 6750). La réponse ne dit jamais pourquoi.
  - Fournisseur d'identité injoignable (le résolveur lève `IdentityProviderUnavailableError`) : `503`. L'accès n'est jamais accordé dans le doute.
  - Sans aucun des rôles de `@RequireRoles(...)` : `403`, journalisé avec l'identifiant opaque de l'utilisateur, le modèle de route (`/sites/:siteId`, sans query string) et les rôles requis.
- `AuthModule.forRootAsync({ imports?, inject, useFactory })` : même chose, avec un résolveur construit à partir de dépendances injectées (configuration, horloge).
- `Actor` : `userId`, `organizationId`, `roles`. Injecté dans un contrôleur par `@CurrentActor()`.
- `ActorResolver` : la fonction qui retrouve l'utilisateur d'une requête. C'est le seul point à remplacer pour brancher un fournisseur d'identité. Par défaut, aucun utilisateur n'est reconnu.

## OIDC : `createOidcActorResolver(options)`

Reconnaît l'utilisateur à son jeton d'accès (`Authorization: Bearer …`), vérifié avec [`jose`](https://github.com/panva/jose) (ADR-0030).

| Contrôle           | Règle                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Signature          | `RS256` uniquement, par une clé du JWKS de `jwksUrl`. L'adresse vient de la configuration, jamais du jeton. |
| Émetteur, audience | `issuer` et `audience` exacts                                                                               |
| Dates              | `exp` obligatoire ; `exp` et `nbf` vérifiés à l'heure du port `Clock`                                       |
| Sujet              | `sub` obligatoire : il devient `userId`                                                                     |
| Type de jeton      | `claims.tokenType` : la revendication et la valeur d'un jeton d'accès. Un ID token est refusé               |
| Organisation       | `claims.organization` : une chaîne acceptée par `isOrganizationId`                                          |
| Rôles              | `claims.roles` : une liste de chaînes. Seuls les `knownRoles` sont gardés                                   |

- Tout jeton absent ou refusé donne `undefined` (401), sans motif.
- Le JWKS est mis en cache. Une clé inconnue déclenche un nouveau téléchargement, au plus une fois par `jwksFetch.cooldownMs` (30 s par défaut) : une rotation de clé est suivie sans redémarrer.
- Un téléchargement du JWKS qui dépasse `jwksFetch.timeoutMs`, échoue, ou rend un JWKS mal formé, lève `IdentityProviderUnavailableError` (503).
- Le cache du JWKS garde l'horloge interne de `jose` : le port `Clock` ne date que la validité du jeton.

```ts
AuthModule.forRootAsync({
  inject: [ConfigService, CLOCK],
  useFactory: (config: ConfigService<Env, true>, clock: Clock) => ({
    resolveActor: createOidcActorResolver({
      issuer: config.get('OIDC_ISSUER_URL'),
      audience: config.get('OIDC_AUDIENCE'),
      jwksUrl: new URL(config.get('OIDC_JWKS_URL')),
      clock,
      claims: {
        organization: 'organization_id',
        roles: 'roles',
        tokenType: { name: 'typ', value: 'Bearer' },
      },
      knownRoles: ['admin', 'manager', 'employee'],
      isOrganizationId: (value) => isUuid(value),
    }),
  }),
});
```

## Tests

Le parcours avec un fournisseur réel est couvert par `infra/src/keycloak.integration.spec.ts` :
connexion navigateur Authorization Code + PKCE, puis appels à l'API construite. La configuration
locale est documentée dans [infra/keycloak](../../../infra/keycloak/README.md).

`@trame/platform/auth/testing` fournit :

- `testActorResolver`, qui lit l'utilisateur dans l'en-tête `x-test-actor` (JSON), et `testActorHeader(actor)` ;
- `JwksTestServer`, un serveur JWKS local : il publie des clés, compte les téléchargements, et simule un fournisseur lent ou en erreur.

Ce point d'entrée est interdit hors des fichiers de test par la lint.

```ts
Test.createTestingModule({ imports: [AuthModule.forRoot({ resolveActor: testActorResolver }), ...] });
request(app).get('/sites').set(TEST_ACTOR_HEADER, testActorHeader(admin));
```
