import { DomainError } from '../domain-error';

export class InvalidAbsencePeriodError extends DomainError {
  constructor() {
    super('La fin doit suivre le début.');
  }
}

export class InvalidAbsenceReasonError extends DomainError {
  constructor() {
    super(
      "Le motif d'une absence est une catégorie : congé, arrêt de travail, formation ou autre.",
    );
  }
}

export class InvalidWeekStartError extends DomainError {
  constructor() {
    super('Une semaine commence un lundi.');
  }
}
