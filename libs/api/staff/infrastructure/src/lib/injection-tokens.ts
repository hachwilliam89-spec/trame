/** Jeton du dépôt des références qui valorisent les absences. */
export const ABSENCE_WEEK_REFERENCE_REPOSITORY = Symbol('ABSENCE_WEEK_REFERENCE_REPOSITORY');

/** Port vers `scheduling` et `demand`, fourni par un module de l'application. */
export const PLANNING_REFERENCE_SOURCE = Symbol('PLANNING_REFERENCE_SOURCE');

/** Jeton du dépôt des absences. */
export const ABSENCE_REPOSITORY = Symbol('ABSENCE_REPOSITORY');

/** Jeton du dépôt des contrats de travail. */
export const CONTRACT_REPOSITORY = Symbol('CONTRACT_REPOSITORY');

/** Jeton du dépôt des employés. Les tests HTTP y substituent le dépôt en mémoire. */
export const EMPLOYEE_REPOSITORY = Symbol('EMPLOYEE_REPOSITORY');

/**
 * Jeton du port `OrganizationCatalog`. L'application fournit l'adaptateur, qui appelle les use
 * cases publics du contexte `organization` (AGENTS.md, règle 4).
 */
export const ORGANIZATION_CATALOG = Symbol('ORGANIZATION_CATALOG');
