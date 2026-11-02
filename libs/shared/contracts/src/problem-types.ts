/**
 * Types de problème propres à Trame (RFC 9457), partagés par l'API et le front.
 *
 * Ce sont des URI `tag:` (RFC 4151) : un identifiant stable et unique, fondé sur un nom de domaine
 * détenu à la date indiquée. Elles ne sont pas résolvables, ce que la RFC 9457 autorise (§3.1.1).
 * Le front compare le `type` complet d'une réponse à ces constantes (ADR-0028).
 *
 * Un type n'est jamais renommé une fois publié : on en crée un nouveau.
 * Les erreurs sans sémantique propre (404, 401, 403) gardent `about:blank`.
 */
const PROBLEM_TYPE_PREFIX = 'tag:wkhach.dev,2026-11-02:trame:problem:';

export const problemTypes = {
  skillInUse: `${PROBLEM_TYPE_PREFIX}skill-in-use`,
  /** Un autre site de l'organisation porte déjà ce code. */
  siteCodeAlreadyUsed: `${PROBLEM_TYPE_PREFIX}site-code-already-used`,
} as const;

export type ProblemType = (typeof problemTypes)[keyof typeof problemTypes];
