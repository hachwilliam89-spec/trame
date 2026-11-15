import { DomainError } from '../domain-error';

export class InvalidWeekStartError extends DomainError {
  constructor() {
    super('Une semaine de besoins commence un lundi.');
  }
}

export class NeedOutsideWeekError extends DomainError {
  constructor() {
    super('Chaque besoin porte sur un jour de la semaine, du lundi au dimanche.');
  }
}

export class InvalidRequiredCountError extends DomainError {
  constructor() {
    super('Le nombre de personnes requises est un entier compris entre 1 et 999.');
  }
}

export class DuplicateCoverageNeedError extends DomainError {
  constructor() {
    super("Un jour, un créneau et un poste n'ont qu'un seul besoin.");
  }
}
