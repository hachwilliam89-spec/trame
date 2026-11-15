import { DomainError } from '../domain-error';

export class InvalidWeeklyVolumeError extends DomainError {
  constructor() {
    super(
      'Le volume hebdomadaire se donne en minutes entières : un minimum positif ou nul, inférieur ou égal au maximum, et un maximum entre 1 minute et 168 heures.',
    );
  }
}

export class InvalidContractPeriodError extends DomainError {
  constructor() {
    super('La date de fin du contrat ne peut pas précéder sa date de début.');
  }
}

export class OverlappingContractError extends DomainError {
  constructor() {
    super("L'employé a déjà un contrat sur cette période.");
  }
}
