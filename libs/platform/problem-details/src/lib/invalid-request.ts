import { ProblemDetailsException } from './problem-details';

/** Champ invalide d'une requête, au format des exemples de la RFC 9457. */
export interface InvalidParam {
  /** JSON Pointer (RFC 6901) vers le champ, préfixé par `#` : `#/timeZone`. */
  pointer: string;
  /** Explication lisible par un humain. */
  detail: string;
  /** Code stable, utilisable par le client : `too_small`, `unknown_time_zone`… */
  code: string;
}

/** Erreur 400 qui liste les champs invalides dans l'extension `errors`. */
export function invalidRequest(errors: InvalidParam[]): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 400,
    detail: 'La requête contient des données invalides.',
    errors,
  });
}
