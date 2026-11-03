export {
  ACTOR_RESOLVER,
  type Actor,
  type ActorResolver,
  type AuthenticatedRequest,
} from './lib/actor';
export { CurrentActor, Public, RequireRoles } from './lib/decorators';
export { AuthGuard } from './lib/auth.guard';
export { AuthModule, type AuthModuleAsyncOptions, type AuthModuleOptions } from './lib/auth.module';
export { IdentityProviderUnavailableError } from './lib/identity-provider-unavailable.error';
export {
  type OidcActorResolverOptions,
  type OidcClaimNames,
  createOidcActorResolver,
} from './lib/oidc/oidc-actor-resolver';
