import type { ScheduleGeneration } from '@trame/api/scheduling/domain';
import type { ScheduleGenerations } from './schedule-generations';

export interface GetLatestWeekScheduleQuery {
  organizationId: string;
  siteId: string;
  /** Lundi de la semaine. */
  weekStartsOn: Temporal.PlainDate;
}

/**
 * Dernière génération d'une semaine terminée avec un planning (`OPTIMAL` ou `FEASIBLE`), à cet
 * instant : une génération encore en cours n'en fait pas partie. Use case public, lu par le
 * contexte `staff` pour figer le planning de référence d'une absence (US-033). Il ne vérifie pas
 * le site : l'appelant l'a déjà fait, et la lecture reste limitée à l'organisation.
 */
export class GetLatestWeekSchedule {
  constructor(private readonly generations: ScheduleGenerations) {}

  async execute(query: GetLatestWeekScheduleQuery): Promise<ScheduleGeneration | undefined> {
    const week = await this.generations.latestOfWeek(
      query.organizationId,
      query.siteId,
      query.weekStartsOn,
    );
    return week.latestSchedule;
  }
}
