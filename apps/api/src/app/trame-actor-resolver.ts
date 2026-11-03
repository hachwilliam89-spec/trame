import type { ConfigService } from '@nestjs/config';
import { type ActorResolver, createOidcActorResolver } from '@trame/platform/auth';
import type { Clock } from '@trame/platform/clock';
import { roleV1 } from '@trame/shared/contracts';
import { validate as isUuid } from 'uuid';
import type { Env } from '../config/env.schema';

/**
 * Lecture des jetons Keycloak pour Trame (US-020) :
 * - l'organisation est la revendication `organization_id`, un UUID comme en base ;
 * - les rôles sont la revendication `roles`, posée par un mapper du realm ;
 * - un jeton d'accès Keycloak porte `typ: Bearer`, un ID token `typ: ID`.
 */
export function trameActorResolver(config: ConfigService<Env, true>, clock: Clock): ActorResolver {
  return createOidcActorResolver({
    issuer: config.get('OIDC_ISSUER_URL', { infer: true }),
    audience: config.get('OIDC_AUDIENCE', { infer: true }),
    jwksUrl: new URL(config.get('OIDC_JWKS_URL', { infer: true })),
    clock,
    claims: {
      organization: 'organization_id',
      roles: 'roles',
      tokenType: { name: 'typ', value: 'Bearer' },
    },
    knownRoles: roleV1.options,
    isOrganizationId: (value) => isUuid(value),
    jwksFetch: { timeoutMs: 3_000 },
  });
}
