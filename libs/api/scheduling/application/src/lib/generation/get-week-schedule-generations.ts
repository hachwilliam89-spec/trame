import { ensureWeekStartsOnMonday } from '@trame/api/scheduling/domain';
import { SiteNotFoundError } from './generation.errors';
import type { ScheduleGenerations, WeekScheduleGenerations } from './schedule-generations';
import type { WeekPlanningSource } from './week-planning-source';

export interface GetWeekScheduleGenerationsQuery {
  organizationId: string;
  siteId: string;
  weekStartsOn: Temporal.PlainDate;
}

/** Retrouve les générations d'une semaine après un rechargement de la page. */
export class GetWeekScheduleGenerations {
  constructor(
    private readonly generations: ScheduleGenerations,
    private readonly planning: WeekPlanningSource,
  ) {}

  async execute(query: GetWeekScheduleGenerationsQuery): Promise<WeekScheduleGenerations> {
    ensureWeekStartsOnMonday(query.weekStartsOn);
    if (!(await this.planning.hasSite(query.organizationId, query.siteId))) {
      throw new SiteNotFoundError();
    }
    return this.generations.latestOfWeek(query.organizationId, query.siteId, query.weekStartsOn);
  }
}
