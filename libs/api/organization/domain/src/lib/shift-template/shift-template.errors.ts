import { DomainError } from '../domain-error';

export class BlankShiftTemplateLabelError extends DomainError {
  constructor() {
    super('Le libellé du créneau est obligatoire.');
  }
}

export class EmptyShiftError extends DomainError {
  constructor() {
    super("Un créneau ne peut pas finir à l'heure où il commence.");
  }
}

export class InvalidBreakDurationError extends DomainError {
  constructor() {
    super('La durée de la pause est un nombre entier de minutes, supérieur à zéro.');
  }
}

/** Règle métier : la pause est positionnée à l'intérieur du créneau. */
export class BreakOutsideShiftError extends DomainError {
  constructor() {
    super('La pause doit commencer et finir pendant le créneau.');
  }
}
