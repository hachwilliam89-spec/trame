export { ORGANIZATION_CATALOG } from './lib/injection-tokens';
export { StaffModule, type StaffModuleOptions } from './lib/staff.module';
// Dépôts, pour assembler une unité de travail hors de Nest (ADR-0038).
export { PrismaContractRepository } from './lib/persistence/prisma-contract.repository';
export { PrismaEmployeeRepository } from './lib/persistence/prisma-employee.repository';
