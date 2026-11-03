import { DomainError } from '../domain-error';

export class InvalidPositionNameError extends DomainError {
  constructor() {
    super(
      'Le nom du poste doit contenir entre 1 et 100 caractères, dont au moins un caractère visible.',
    );
  }
}

export class DuplicateRequiredSkillError extends DomainError {
  constructor() {
    super("Une compétence ne peut être exigée qu'une fois par poste.");
  }
}
