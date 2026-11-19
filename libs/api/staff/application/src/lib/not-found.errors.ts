/**
 * Ressource absente, ou appartenant à une autre organisation : les deux cas sont indiscernables
 * pour l'appelant (AGENTS.md, règle 9), qui ne doit pas apprendre qu'une ressource existe ailleurs.
 */
export class AbsenceNotFoundError extends Error {
  constructor() {
    super('Absence introuvable.');
    this.name = 'AbsenceNotFoundError';
  }
}

export class EmployeeNotFoundError extends Error {
  constructor() {
    super('Employé introuvable.');
    this.name = 'EmployeeNotFoundError';
  }
}

export class SiteNotFoundError extends Error {
  constructor() {
    super('Site introuvable.');
    this.name = 'SiteNotFoundError';
  }
}

export class SkillNotFoundError extends Error {
  constructor() {
    super('Compétence introuvable.');
    this.name = 'SkillNotFoundError';
  }
}
