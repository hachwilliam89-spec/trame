import { DomainError } from '../domain-error';

export class InvalidSkillNameError extends DomainError {
  constructor() {
    super(
      'Le nom de la compétence doit contenir entre 1 et 100 caractères, dont au moins un caractère visible.',
    );
  }
}

export class SkillInUseError extends DomainError {
  constructor() {
    super('Cette compétence est requise par un poste et ne peut pas être supprimée.');
  }
}
