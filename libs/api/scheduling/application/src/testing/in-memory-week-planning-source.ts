import type { WeekPlanning } from '@trame/api/scheduling/domain';
import type { WeekPlanningSource } from '../lib/generation/week-planning-source';

/** Une semaine par site, quelle que soit la semaine demandée : le site seul compte ici. */
export class InMemoryWeekPlanningSource implements WeekPlanningSource {
  private readonly weeks = new Map<string, WeekPlanning>();

  define(organizationId: string, planning: WeekPlanning): void {
    this.weeks.set(keyOf(organizationId, planning.siteId), planning);
  }

  forget(organizationId: string, siteId: string): void {
    this.weeks.delete(keyOf(organizationId, siteId));
  }

  async read(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<WeekPlanning | undefined> {
    const planning = this.weeks.get(keyOf(organizationId, siteId));
    if (planning === undefined) {
      return undefined;
    }
    return { ...planning, weekStartsOn };
  }

  async hasSite(organizationId: string, siteId: string): Promise<boolean> {
    return this.weeks.has(keyOf(organizationId, siteId));
  }
}

function keyOf(organizationId: string, siteId: string): string {
  return JSON.stringify([organizationId, siteId]);
}
