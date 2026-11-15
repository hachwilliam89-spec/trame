/** Jeton du dépôt des besoins de couverture. Les tests HTTP y substituent le dépôt en mémoire. */
export const WEEKLY_COVERAGE_REPOSITORY = Symbol('WEEKLY_COVERAGE_REPOSITORY');

/**
 * Jeton du port `SiteCatalog`. L'application fournit l'adaptateur, qui appelle les use cases
 * publics du contexte `organization` (AGENTS.md, règle 4).
 */
export const SITE_CATALOG = Symbol('SITE_CATALOG');
