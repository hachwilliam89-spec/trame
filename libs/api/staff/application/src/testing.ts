/**
 * Outils de test : jamais importés par du code de production (règle ESLint `no-restricted-imports`).
 */
export { ContractBuilder, aContract } from './testing/contract-builder';
export { EmployeeBuilder, anEmployee } from './testing/employee-builder';
export { InMemoryContractRepository } from './testing/in-memory-contract.repository';
export { InMemoryEmployeeRepository } from './testing/in-memory-employee.repository';
export { InMemoryOrganizationCatalog } from './testing/in-memory-organization-catalog';
