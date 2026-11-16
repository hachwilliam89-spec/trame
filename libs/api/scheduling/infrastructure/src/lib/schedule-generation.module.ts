import { type DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';
import {
  GetScheduleGeneration,
  GetWeekScheduleGenerations,
  type ScheduleGenerations,
  StartScheduleGeneration,
  type WeekPlanningSource,
} from '@trame/api/scheduling/application';
import { CLOCK, type Clock } from '@trame/platform/clock';
import { ID_GENERATOR, type IdGenerator } from '@trame/platform/ids';
import { SCHEDULE_GENERATIONS, WEEK_PLANNING_SOURCE } from './generation.tokens';
import { PrismaScheduleGenerations } from './persistence/prisma-schedule-generations';

type ImportedModule = NonNullable<ModuleMetadata['imports']>[number];

export interface ScheduleGenerationModuleOptions {
  /** Module de l'application qui fournit et exporte le port `WEEK_PLANNING_SOURCE`. */
  weekPlanning: ImportedModule;
}

/**
 * Génération du planning d'une semaine (US-061). Le lancement par HTTP n'arrive qu'avec la PR 6b,
 * quand le relais sait router la demande et recevoir son résultat.
 * Requiert `DatabaseModule`, `ClockModule` et `IdsModule` dans l'application.
 */
@Module({})
export class ScheduleGenerationModule {
  static forRoot(options: ScheduleGenerationModuleOptions): DynamicModule {
    return {
      module: ScheduleGenerationModule,
      imports: [options.weekPlanning],
      providers: [
        { provide: SCHEDULE_GENERATIONS, useClass: PrismaScheduleGenerations },
        {
          provide: StartScheduleGeneration,
          inject: [SCHEDULE_GENERATIONS, WEEK_PLANNING_SOURCE, CLOCK, ID_GENERATOR],
          useFactory: (
            generations: ScheduleGenerations,
            planning: WeekPlanningSource,
            clock: Clock,
            ids: IdGenerator,
          ) => new StartScheduleGeneration(generations, planning, clock, ids),
        },
        {
          provide: GetScheduleGeneration,
          inject: [SCHEDULE_GENERATIONS],
          useFactory: (generations: ScheduleGenerations) => new GetScheduleGeneration(generations),
        },
        {
          provide: GetWeekScheduleGenerations,
          inject: [SCHEDULE_GENERATIONS, WEEK_PLANNING_SOURCE],
          useFactory: (generations: ScheduleGenerations, planning: WeekPlanningSource) =>
            new GetWeekScheduleGenerations(generations, planning),
        },
      ],
    };
  }
}
