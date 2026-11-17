export { OrganizationModule } from './lib/organization.module';
// Dépôts, pour assembler une unité de travail hors de Nest (ADR-0038).
export { PrismaPositionRepository } from './lib/persistence/prisma-position.repository';
export { PrismaShiftTemplateRepository } from './lib/persistence/prisma-shift-template.repository';
export { PrismaSiteRepository } from './lib/persistence/prisma-site.repository';
export { PrismaSkillRepository } from './lib/persistence/prisma-skill.repository';
