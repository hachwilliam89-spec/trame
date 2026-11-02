import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Actor, AuthenticatedRequest } from './actor';

export const IS_PUBLIC_KEY = 'auth:public';
export const REQUIRED_ROLES_KEY = 'auth:roles';

/** Route accessible sans authentification (sondes de santé, par exemple). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Route réservée aux utilisateurs qui ont au moins un des rôles donnés. */
export const RequireRoles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);

/** Injecte l'utilisateur authentifié dans un paramètre de contrôleur. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.actor === undefined) {
      // Ne peut arriver que sur une route @Public() : c'est une erreur de programmation.
      throw new Error('@CurrentActor() utilisé sur une route sans authentification.');
    }
    return request.actor;
  },
);
