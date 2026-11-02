# `@trame/platform/auth`

Authentification et rôles, indépendants du fournisseur d'identité.

- `AuthModule.forRoot({ resolveActor? })` : enregistre `AuthGuard` comme garde globale. Toute route exige un utilisateur, sauf celles marquées `@Public()`.
  - Sans utilisateur : `401` en problem+json.
  - Sans aucun des rôles de `@RequireRoles(...)` : `403`.
- `Actor` : `userId`, `organizationId`, `roles`. Injecté dans un contrôleur par `@CurrentActor()`.
- `ActorResolver` : la fonction qui retrouve l'utilisateur d'une requête. C'est le seul point à remplacer pour brancher un fournisseur d'identité (OIDC). Par défaut, aucun utilisateur n'est reconnu.

## Tests

`@trame/platform/auth/testing` fournit `testActorResolver`, qui lit l'utilisateur dans l'en-tête `x-test-actor` (JSON), et `testActorHeader(actor)`. Ce point d'entrée est interdit hors des fichiers de test par la lint.

```ts
Test.createTestingModule({ imports: [AuthModule.forRoot({ resolveActor: testActorResolver }), ...] });
request(app).get('/sites').set(TEST_ACTOR_HEADER, testActorHeader(admin));
```
