/**
 * Outils de test : jamais importés par du code de production (règle ESLint `no-restricted-imports`).
 */
import type { Actor, ActorResolver } from './lib/actor';

/** En-tête qui porte l'utilisateur de test, en JSON. */
export const TEST_ACTOR_HEADER = 'x-test-actor';

/** Lit l'utilisateur dans l'en-tête `x-test-actor`. À utiliser avec `AuthModule.forRoot()` dans les tests. */
export const testActorResolver: ActorResolver = (request) => {
  const header = request.headers[TEST_ACTOR_HEADER];
  if (typeof header !== 'string') {
    return undefined;
  }
  return JSON.parse(header) as Actor;
};

/** Valeur de l'en-tête `x-test-actor` pour un utilisateur donné. */
export function testActorHeader(actor: Actor): string {
  return JSON.stringify(actor);
}

/** Serveur JWKS local, pour tester un résolveur OIDC sans fournisseur d'identité. */
export { JwksTestServer } from './lib/oidc/jwks-test-server';
