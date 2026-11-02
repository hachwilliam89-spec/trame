import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemDetailsException } from '@trame/platform/problem-details';
import { ACTOR_RESOLVER, type Actor, type ActorResolver, type AuthenticatedRequest } from './actor';
import { IS_PUBLIC_KEY, REQUIRED_ROLES_KEY } from './decorators';

/**
 * Garde globale : toute route exige un utilisateur authentifié, sauf `@Public()`.
 * - Pas d'utilisateur : 401.
 * - Utilisateur sans aucun des rôles de `@RequireRoles()` : 403.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACTOR_RESOLVER) private readonly resolveActor: ActorResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.metadata<boolean>(IS_PUBLIC_KEY, context) === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actor = await this.resolveActor(request);
    if (actor === undefined) {
      throw new ProblemDetailsException({ status: 401, detail: 'Authentification requise.' });
    }
    request.actor = actor;

    const requiredRoles = this.metadata<string[]>(REQUIRED_ROLES_KEY, context) ?? [];
    if (!hasOneOf(actor, requiredRoles)) {
      throw new ProblemDetailsException({
        status: 403,
        detail: 'Vos droits ne permettent pas cette action.',
      });
    }
    return true;
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
