import { invalidRequest } from './invalid-request';
import { ProblemDetailsException } from './problem-details';

/** Classe d'erreur. Ses sous-classes sont concernées aussi. */
export type ErrorClass = abstract new (...args: never[]) => Error;

/** Erreur rendue comme un problème (404, 409…). Son message devient le `detail`. */
export interface ProblemMapping {
  error: ErrorClass;
  status: number;
  /** URI du type de problème. Absent : `about:blank`, seul le statut HTTP compte. */
  type?: string;
  /** Résumé stable du type. Absent : libellé HTTP du statut. */
  title?: string;
}

/**
 * Erreur qui porte sur un champ de la requête. Elle est rendue exactement comme une erreur de
 * validation du schéma (400 avec `errors`) : le client traite les deux de la même façon.
 */
export interface InvalidFieldMapping {
  error: ErrorClass;
  /** Champ en cause, en JSON Pointer : `#/timeZone`. */
  pointer: string;
  /** Code stable de l'erreur : `unknown_time_zone`. */
  code: string;
}

export type ErrorMapping = ProblemMapping | InvalidFieldMapping;

/**
 * Traduit une erreur en `ProblemDetailsException` selon la première correspondance trouvée.
 * Une erreur sans correspondance est renvoyée telle quelle : le filtre en fera un 500 générique.
 */
export function translateError(error: unknown, mappings: readonly ErrorMapping[]): unknown {
  if (!(error instanceof Error)) {
    return error;
  }
  for (const mapping of mappings) {
    if (error instanceof mapping.error) {
      return toProblemException(error, mapping);
    }
  }
  return error;
}

function toProblemException(error: Error, mapping: ErrorMapping): ProblemDetailsException {
  if ('pointer' in mapping) {
    return invalidRequest([
      { pointer: mapping.pointer, detail: error.message, code: mapping.code },
    ]);
  }
  return new ProblemDetailsException({
    status: mapping.status,
    type: mapping.type,
    title: mapping.title,
    detail: error.message,
  });
}
