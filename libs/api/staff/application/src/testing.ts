/**
 * Outils de test : jamais importés par du code de production (règle ESLint `no-restricted-imports`).
 */
export { ContractBuilder, aContract } from './testing/contract-builder';
export { EmployeeBuilder, anEmployee } from './testing/employee-builder';
export { InMemoryAbsenceWeekReferenceRepository } from './testing/in-memory-absence-week-reference.repository';
export { InMemoryAbsenceRepository } from './testing/in-memory-absence.repository';
export { InMemoryPlanningReferenceSource } from './testing/in-memory-planning-reference-source';
export { InMemoryContractRepository } from './testing/in-memory-contract.repository';
export { InMemoryEmployeeRepository } from './testing/in-memory-employee.repository';
export { InMemoryOrganizationCatalog } from './testing/in-memory-organization-catalog';
export { InMemoryWeekAbsencesSnapshotReader } from './testing/in-memory-week-absences-snapshot-reader';
