import { Module } from '@nestjs/common';
import { GetLatestWeekSchedule, type ScheduleGenerations } from '@trame/api/scheduling/application';
import { SCHEDULE_GENERATIONS } from './generation.tokens';
import { PrismaScheduleGenerations } from './persistence/prisma-schedule-generations';

/**
 * Lecture des plannings d'une semaine par les autres contextes (US-033). Ce module n'importe aucun
 * autre contexte : `staff` s'en sert sans former de boucle, alors que `ScheduleGenerationModule`
 * importe déjà `staff` pour composer le problème.
 * Requiert `DatabaseModule` dans l'application.
 */
@Module({
  providers: [
    { provide: SCHEDULE_GENERATIONS, useClass: PrismaScheduleGenerations },
    {
      provide: GetLatestWeekSchedule,
      inject: [SCHEDULE_GENERATIONS],
      useFactory: (generations: ScheduleGenerations) => new GetLatestWeekSchedule(generations),
    },
  ],
  exports: [GetLatestWeekSchedule],
})
export class ScheduleReadModule {}
