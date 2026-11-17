import { type DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';
import {
  GetScheduleGeneration,
  GetWeekScheduleGenerations,
  ReadScheduleGenerationProgress,
  type ScheduleGenerationProgress,
  type ScheduleGenerations,
  StartScheduleGeneration,
  type WeekPlanningSource,
} from '@trame/api/scheduling/application';
import { CLOCK, type Clock } from '@trame/platform/clock';
import { ID_GENERATOR, type IdGenerator } from '@trame/platform/ids';
import {
  SCHEDULE_GENERATION_PROGRESS,
  SCHEDULE_GENERATIONS,
  WEEK_PLANNING_SOURCE,
} from './generation.tokens';
import { ScheduleGenerationProgressController } from './http/schedule-generation-progress.controller';
import { ScheduleGenerationsController } from './http/schedule-generations.controller';
import { PrismaScheduleGenerationProgress } from './persistence/prisma-schedule-generation-progress';
import { PrismaScheduleGenerations } from './persistence/prisma-schedule-generations';

type ImportedModule = NonNullable<ModuleMetadata['imports']>[number];

export interface ScheduleGenerationModuleOptions {
  /** Module de l'application qui fournit et exporte le port `WEEK_PLANNING_SOURCE`. */
  weekPlanning: ImportedModule;
}

/**
 * Génération du planning d'une semaine (US-061) : lancement, lecture et progression par HTTP. Le
 * relais publie la demande et reçoit le résultat (`ScheduleTransport`).
 * Requiert `DatabaseModule`, `ClockModule` et `IdsModule` dans l'application.
 */
@Module({})
export class ScheduleGenerationModule {
  static forRoot(options: ScheduleGenerationModuleOptions): DynamicModule {
    return {
      module: ScheduleGenerationModule,
      imports: [options.weekPlanning],
      controllers: [ScheduleGenerationsController, ScheduleGenerationProgressController],
      providers: [
        { provide: SCHEDULE_GENERATIONS, useClass: PrismaScheduleGenerations },
        { provide: SCHEDULE_GENERATION_PROGRESS, useClass: PrismaScheduleGenerationProgress },
        {
          provide: ReadScheduleGenerationProgress,
          inject: [SCHEDULE_GENERATION_PROGRESS],
          useFactory: (progress: ScheduleGenerationProgress) =>
            new ReadScheduleGenerationProgress(progress),
        },
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
