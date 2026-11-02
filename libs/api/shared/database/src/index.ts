export { DatabaseModule, type DatabaseModuleAsyncOptions } from './lib/database.module';
export { DatabaseReadiness } from './lib/database-readiness';
export { dateToInstant, instantToDate } from './lib/instant-conversions';
export { DATABASE_OPTIONS, type DatabaseOptions, PrismaService } from './lib/prisma.service';
export { isUniqueViolation } from './lib/unique-violation';
// Types des enregistrements, pour les adaptateurs : `Prisma.SiteModel`, etc.
export type { Prisma } from './generated/prisma/client';
export { isForeignKeyViolation } from './lib/foreign-key-violation';
