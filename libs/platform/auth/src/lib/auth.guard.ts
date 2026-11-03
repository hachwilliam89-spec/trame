import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemDetailsException } from '@trame/platform/problem-details';
import { ACTOR_RESOLVER, type Actor, type ActorResolver, type AuthenticatedRequest } from './actor';
import { IS_PUBLIC_KEY, REQUIRED_ROLES_KEY } from './decorators';
import { IdentityProviderUnavailableError } from './identity-provider-unavailable.error';

/**
 * Garde globale : toute route exige un utilisateur authentifié, sauf `@Public()`.
 * - Pas d'utilisateur : 401, avec `WWW-Authenticate: Bearer` (RFC 6750). Jamais le motif du refus.
 * - Fournisseur d'identité injoignable : 503. Faute de pouvoir vérifier, l'accès n'est pas accordé.
 * - Utilisateur sans aucun des rôles de `@RequireRoles()` : 403, journalisé.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(ACTOR_RESOLVER) private readonly resolveActor: ActorResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.metadata<boolean>(IS_PUBLIC_KEY, context) === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actor = await this.actorOf(request);
    if (actor === undefined) {
      throw new ProblemDetailsException(
        { status: 401, detail: 'Authentification requise.' },
        { headers: { 'WWW-Authenticate': 'Bearer' } },
      );
    }
    request.actor = actor;

    const requiredRoles = this.metadata<string[]>(REQUIRED_ROLES_KEY, context) ?? [];
    if (!hasOneOf(actor, requiredRoles)) {
      this.logDenial(actor, request, requiredRoles);
      throw new ProblemDetailsException({
        status: 403,
        detail: 'Vos droits ne permettent pas cette action.',
      });
    }
    return true;
  }

  private async actorOf(request: AuthenticatedRequest): Promise<Actor | undefined> {
    try {
      return await this.resolveActor(request);
    } catch (error) {
      if (error instanceof IdentityProviderUnavailableError) {
        throw new ProblemDetailsException({
          status: 503,
          detail: "L'authentification est momentanément indisponible.",
        });
      }
      throw error;
    }
  }

  /**
   * Le modèle de route (`/sites/:siteId`) plutôt que l'URL : ni identifiant de ressource ni query
   * string dans les logs. L'utilisateur n'y figure que par son identifiant opaque.
   */
  private logDenial(
    actor: Actor,
    request: AuthenticatedRequest,
    requiredRoles: readonly string[],
  ): void {
    const routePath = (request.route as { path?: string } | undefined)?.path ?? 'inconnue';
    this.logger.warn({
      msg: 'Accès refusé',
      userId: actor.userId,
      route: `${request.baseUrl}${routePath}`,
      requiredRoles,
    });
  }

  private metadata<T>(key: string, context: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()]);
  }
}

/** Vrai si aucun rôle n'est exigé, ou si l'utilisateur en a au moins un. */
function hasOneOf(actor: Actor, requiredRoles: readonly string[]): boolean {
  if (requiredRoles.length === 0) {
    return true;
  }
  return requiredRoles.some((role) => actor.roles.includes(role));
}
