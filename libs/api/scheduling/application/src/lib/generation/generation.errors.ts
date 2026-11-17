export class ScheduleGenerationNotFoundError extends Error {
  constructor() {
    super('Génération introuvable.');
  }
}

/** Le site n'existe pas, ou appartient à une autre organisation : la réponse est la même. */
export class SiteNotFoundError extends Error {
  constructor() {
    super('Site introuvable.');
  }
}

/** Une clé d'idempotence désigne une seule demande : un site et une semaine. */
export class IdempotencyKeyReusedError extends Error {
  constructor() {
    super('Cette clé d’idempotence a déjà servi pour un autre site ou une autre semaine.');
  }
}

/** Le problème de la semaine, une fois publié, dépasserait la taille acceptée par le moteur. */
export class ScheduleRequestTooLargeError extends Error {
  constructor() {
    super('La semaine est trop grande pour un seul calcul.');
  }
}

/**
 * Le problème de la semaine sort des limites du contrat du moteur (par exemple plus de
 * 50 habilitations pour un salarié) : la demande serait refusée par le relais.
 */
export class ScheduleRequestOutOfBoundsError extends Error {
  constructor() {
    super('La semaine dépasse les limites acceptées par le moteur de planification.');
  }
}
