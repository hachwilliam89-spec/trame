export {
  ACTOR_RESOLVER,
  type Actor,
  type ActorResolver,
  type AuthenticatedRequest,
} from './lib/actor';
export { CurrentActor, Public, RequireRoles } from './lib/decorators';
export { AuthGuard } from './lib/auth.guard';
export { AuthModule, type AuthModuleOptions } from './lib/auth.module';
