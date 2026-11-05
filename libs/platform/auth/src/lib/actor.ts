import type { Request } from 'express';

/** Utilisateur authentifié à l'origine de la requête. */
export interface Actor {
  readonly userId: string;
  /** Organisation de l'utilisateur : toute donnée lue ou écrite est filtrée dessus. */
  readonly organizationId: string;
  readonly roles: readonly string[];
  /** Échéance vérifiée de la session ; exigée par les connexions longues. */
  readonly expiresAtEpochMilliseconds?: number;
}

/**
 * Retrouve l'utilisateur d'une requête, ou `undefined` s'il n'est pas authentifié.
 * C'est le seul point à remplacer pour brancher un fournisseur d'identité (OIDC, JWT…).
 */
export type ActorResolver = (request: Request) => Actor | undefined | Promise<Actor | undefined>;

/** Jeton d'injection de l'`ActorResolver`. */
export const ACTOR_RESOLVER = Symbol('ACTOR_RESOLVER');

/** Requête après passage de `AuthGuard`. */
export interface AuthenticatedRequest extends Request {
  actor?: Actor;
}
