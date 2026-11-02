import { DomainError } from '../domain-error';

export class InvalidSiteCodeError extends DomainError {
  constructor(code: string) {
    super(
      `Le code de site « ${code} » est invalide : de 1 à 20 majuscules, chiffres ou tirets, sans tiret au début.`,
    );
  }
}

export class UnknownTimeZoneError extends DomainError {
  constructor(name: string) {
    super(`Le fuseau horaire « ${name} » est inconnu. Exemple de fuseau valide : Europe/Paris.`);
  }
}

export class BlankSiteNameError extends DomainError {
  constructor() {
    super('Le nom du site est obligatoire.');
  }
}

/** Règle métier : un code de site est unique dans l'organisation. */
export class SiteCodeAlreadyUsedError extends DomainError {
  constructor(code: string) {
    super(`Le code de site « ${code} » est déjà utilisé dans l'organisation.`);
  }
}
