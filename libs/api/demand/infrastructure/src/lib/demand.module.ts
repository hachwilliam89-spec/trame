import { type DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';
import {
  DefineWeeklyCoverage,
  GetWeeklyCoverage,
  type SiteCatalog,
  type WeeklyCoverageRepository,
} from '@trame/api/demand/application';
import { CLOCK, type Clock } from '@trame/platform/clock';
import { CoverageNeedsController } from './http/coverage-needs.controller';
import { SITE_CATALOG, WEEKLY_COVERAGE_REPOSITORY } from './injection-tokens';
import { PrismaWeeklyCoverageRepository } from './persistence/prisma-weekly-coverage.repository';

type ImportedModule = NonNullable<ModuleMetadata['imports']>[number];

export interface DemandModuleOptions {
  /** Module de l'application qui fournit et exporte le port `SITE_CATALOG`. */
  siteCatalog: ImportedModule;
}

/**
 * Contexte `demand` : besoins de couverture d'une semaine (US-050). Les use cases sont des
 * classes sans framework : ce module les assemble avec leurs dépendances.
 * Requiert `DatabaseModule`, `ClockModule` et `AuthModule` dans l'application.
 */
@Module({})
export class DemandModule {
  static forRoot(options: DemandModuleOptions): DynamicModule {
    return {
      module: DemandModule,
      imports: [options.siteCatalog],
      controllers: [CoverageNeedsController],
      providers: [
        { provide: WEEKLY_COVERAGE_REPOSITORY, useClass: PrismaWeeklyCoverageRepository },
        {
          provide: DefineWeeklyCoverage,
          inject: [SITE_CATALOG, WEEKLY_COVERAGE_REPOSITORY, CLOCK],
          useFactory: (catalog: SiteCatalog, coverages: WeeklyCoverageRepository, clock: Clock) =>
            new DefineWeeklyCoverage(catalog, coverages, clock),
        },
        {
          provide: GetWeeklyCoverage,
          inject: [SITE_CATALOG, WEEKLY_COVERAGE_REPOSITORY],
          useFactory: (catalog: SiteCatalog, coverages: WeeklyCoverageRepository) =>
            new GetWeeklyCoverage(catalog, coverages),
        },
      ],
      // Use cases publics : d'autres parties de l'application définissent et lisent des besoins.
      exports: [DefineWeeklyCoverage, GetWeeklyCoverage],
    };
  }
}
