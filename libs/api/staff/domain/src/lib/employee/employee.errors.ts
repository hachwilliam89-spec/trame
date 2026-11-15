import { DomainError } from '../domain-error';

export class InvalidEmployeeFirstNameError extends DomainError {
  constructor() {
    super('Le prénom doit contenir entre 1 et 100 caractères, dont au moins un caractère visible.');
  }
}

export class InvalidEmployeeLastNameError extends DomainError {
  constructor() {
    super('Le nom doit contenir entre 1 et 100 caractères, dont au moins un caractère visible.');
  }
}

export class DuplicateQualificationError extends DomainError {
  constructor() {
    super("Un employé ne peut avoir qu'une habilitation par compétence.");
  }
}
