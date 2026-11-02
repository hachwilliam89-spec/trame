/**
 * Ressource absente, ou appartenant à une autre organisation : les deux cas sont indiscernables
 * pour l'appelant (AGENTS.md, règle 9), qui ne doit pas apprendre qu'une ressource existe ailleurs.
 */
export class SiteNotFoundError extends Error {
  constructor() {
    super('Site introuvable.');
    this.name = 'SiteNotFoundError';
  }
}

export class ShiftTemplateNotFoundError extends Error {
  constructor() {
    super('Créneau type introuvable.');
    this.name = 'ShiftTemplateNotFoundError';
  }
}
