import type {
  PlanningReferenceSource,
  ReferencePlanning,
} from '../lib/ports/planning-reference-source';

/**
 * Source en mémoire, pour les tests : chaque test fixe le dernier planning réussi d'une semaine
 * et ses jours d'activité. Elle ne filtre pas par organisation : les tests de cloisonnement
 * passent par les employés et les sites.
 */
export class InMemoryPlanningReferenceSource implements PlanningReferenceSource {
  private readonly planningsByEmployee = new Map<string, ReferencePlanning>();
  private readonly activityDaysByWeek = new Map<string, Temporal.PlainDate[]>();

  setLatestPlanning(
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
    employeeId: string,
    planning: ReferencePlanning,
  ): void {
    this.planningsByEmployee.set(`${weekKey(siteId, weekStartsOn)}/${employeeId}`, planning);
  }

  setActivityDays(
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
    activityDays: Temporal.PlainDate[],
  ): void {
    this.activityDaysByWeek.set(weekKey(siteId, weekStartsOn), activityDays);
  }

  async latestPlanningOf(
    _organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
    employeeId: string,
  ): Promise<ReferencePlanning | undefined> {
    return this.planningsByEmployee.get(`${weekKey(siteId, weekStartsOn)}/${employeeId}`);
  }

  async activityDaysOf(
    _organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<Temporal.PlainDate[]> {
    return this.activityDaysByWeek.get(weekKey(siteId, weekStartsOn)) ?? [];
  }
}

function weekKey(siteId: string, weekStartsOn: Temporal.PlainDate): string {
  return `${siteId}/${weekStartsOn.toString()}`;
}
