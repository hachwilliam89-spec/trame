import { STATUS_CODES } from 'node:http';

/** Type de média des erreurs (RFC 9457). */
export const PROBLEM_JSON = 'application/problem+json';

/**
 * Corps d'erreur au format RFC 9457. Les membres d'extension sont autorisés
 * (par exemple `errors` pour le détail d'une validation).
 */
export interface ProblemDetails {
  /** URI qui identifie le type de problème ; `about:blank` quand seul le statut HTTP compte. */
  type: string;
  /** Résumé court, stable pour un même type. */
  title: string;
  status: number;
  /** Explication propre à cette occurrence, lisible par un humain. */
  detail?: string;
  /** Référence de cette occurrence (le chemin de la requête). */
  instance?: string;
  [extension: string]: unknown;
}

/** Problème à construire : seul `status` est obligatoire. */
export interface ProblemInit {
  status: number;
  type?: string;
  title?: string;
  detail?: string;
  instance?: string;
  [extension: string]: unknown;
}

/** Construit un problème complet : `type` vaut `about:blank` et `title` le libellé HTTP par défaut. */
export function problem(init: ProblemInit): ProblemDetails {
  return {
    ...init,
    type: init.type ?? 'about:blank',
    title: init.title ?? STATUS_CODES[init.status] ?? 'Unknown Error',
    status: init.status,
  };
}

/** Exception portant un problème RFC 9457, rendue telle quelle par `ProblemDetailsFilter`. */
export class ProblemDetailsException extends Error {
  readonly problem: ProblemDetails;

  constructor(init: ProblemInit) {
    const details = problem(init);
    super(details.detail ?? details.title);
    this.name = 'ProblemDetailsException';
    this.problem = details;
  }
}
