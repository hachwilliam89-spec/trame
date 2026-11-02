/**
 * Port d'horloge (ADR-0019) : toute lecture de l'heure courante passe par lui.
 * Le code applicatif reçoit un `Clock` ; il n'appelle jamais `new Date()`, `Date.now()` ni `Temporal.Now`.
 */
export interface Clock {
  /** Instant courant (UTC). */
  now(): Temporal.Instant;
}
