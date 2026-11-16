import type { WeekPlanning } from '@trame/api/scheduling/domain';

/**
 * Lecture des contextes `organization`, `demand` et `staff` pour une semaine d'un site.
 * L'adaptateur vit dans l'application (`apps/api`) : les contextes ne s'importent pas entre eux
 * (AGENTS.md, règle 4).
 */
export interface WeekPlanningSource {
  /** `undefined` : le site n'existe pas dans cette organisation. */
  read(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<WeekPlanning | undefined>;
  hasSite(organizationId: string, siteId: string): Promise<boolean>;
}
