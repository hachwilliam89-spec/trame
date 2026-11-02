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

export class SkillNotFoundError extends Error {
  constructor() {
    super('Compétence introuvable.');
    this.name = 'SkillNotFoundError';
  }
}

export class PositionNotFoundError extends Error {
  constructor() {
    super('Poste introuvable.');
    this.name = 'PositionNotFoundError';
  }
}

/** Une référence peut disparaître entre sa lecture et l'enregistrement du poste. */
export class PositionReferenceNotFoundError extends Error {
  constructor() {
    super('Site ou compétence introuvable.');
    this.name = 'PositionReferenceNotFoundError';
  }
}
