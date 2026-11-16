import type { ScheduleGeneration } from '@trame/api/scheduling/domain';
import { SiteNotFoundError } from './generation.errors';
import type { ScheduleGenerations } from './schedule-generations';
import type { WeekPlanningSource } from './week-planning-source';

export interface GetWeekScheduleGenerationsQuery {
  organizationId: string;
  siteId: string;
  weekStartsOn: Temporal.PlainDate;
}

export interface WeekScheduleGenerations {
  /** Dernière génération lancée, quel que soit son état. */
  latestAttempt: ScheduleGeneration | undefined;
  /** Dernier planning exploitable, affiché pendant qu'un nouveau calcul tourne. */
  latestSchedule: ScheduleGeneration | undefined;
}

/** Retrouve les générations d'une semaine après un rechargement de la page. */
export class GetWeekScheduleGenerations {
  constructor(
    private readonly generations: ScheduleGenerations,
    private readonly planning: WeekPlanningSource,
  ) {}

  async execute(query: GetWeekScheduleGenerationsQuery): Promise<WeekScheduleGenerations> {
    if (!(await this.planning.hasSite(query.organizationId, query.siteId))) {
      throw new SiteNotFoundError();
    }
    const { organizationId, siteId, weekStartsOn } = query;
    return {
      latestAttempt: await this.generations.latestAttempt(organizationId, siteId, weekStartsOn),
      latestSchedule: await this.generations.latestWithSchedule(
        organizationId,
        siteId,
        weekStartsOn,
      ),
    };
  }
}
