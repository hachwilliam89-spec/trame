/**
 * Outils de test : jamais importés par du code de production (règle ESLint `no-restricted-imports`).
 */
export { InMemorySiteCatalog } from './testing/in-memory-site-catalog';
export { InMemoryWeeklyCoverageRepository } from './testing/in-memory-weekly-coverage.repository';
export { WeeklyCoverageBuilder, aWeeklyCoverage } from './testing/weekly-coverage-builder';
