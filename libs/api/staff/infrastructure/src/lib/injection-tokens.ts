/** Jeton du dépôt des employés. Les tests HTTP y substituent le dépôt en mémoire. */
export const EMPLOYEE_REPOSITORY = Symbol('EMPLOYEE_REPOSITORY');

/**
 * Jeton du port `OrganizationCatalog`. L'application fournit l'adaptateur, qui appelle les use
 * cases publics du contexte `organization` (AGENTS.md, règle 4).
 */
export const ORGANIZATION_CATALOG = Symbol('ORGANIZATION_CATALOG');
