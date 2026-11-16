import { Module } from '@nestjs/common';
import { OrganizationModule } from '@trame/api/organization/infrastructure';
import { WEEK_PLANNING_SOURCE } from '@trame/api/scheduling/infrastructure';
import { demandModule, staffModule } from '../context-modules';
import { OrganizationPlanningReader } from './organization-planning.reader';
import { StaffPlanningReader } from './staff-planning.reader';
import { WeekPlanningAdapter } from './week-planning.adapter';

/** Fournit au contexte `scheduling` son port vers `organization`, `demand` et `staff`. */
@Module({
  imports: [OrganizationModule, demandModule, staffModule],
  providers: [
    OrganizationPlanningReader,
    StaffPlanningReader,
    { provide: WEEK_PLANNING_SOURCE, useClass: WeekPlanningAdapter },
  ],
  exports: [WEEK_PLANNING_SOURCE],
})
export class SchedulingWeekPlanningModule {}
