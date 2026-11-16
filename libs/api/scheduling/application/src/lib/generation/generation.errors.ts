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
