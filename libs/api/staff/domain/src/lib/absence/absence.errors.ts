import { DomainError } from '../domain-error';

export class InvalidAbsencePeriodError extends DomainError {
  constructor() {
    super('La fin doit suivre le début.');
  }
}

export class AbsenceStartNotOnWholeMinuteError extends DomainError {
  constructor() {
    super('Une absence commence sur une minute entière.');
  }
}

export class AbsenceEndNotOnWholeMinuteError extends DomainError {
  constructor() {
    super('Une absence finit sur une minute entière.');
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

export class NotAnActivityDayError extends DomainError {
  constructor() {
    super(
      "Ce jour n'a pas de besoin sur le site cette semaine : il ne compte pas dans la convention.",
    );
  }
}

export class InvalidDayValuationError extends DomainError {
  constructor(dailyShare: string) {
    super(`Durée refusée : au plus la part journalière, ${dailyShare}.`);
  }
}
