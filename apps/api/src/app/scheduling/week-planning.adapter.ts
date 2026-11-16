import { Injectable } from '@nestjs/common';
import { GetWeeklyCoverage } from '@trame/api/demand/application';
import type { WeekPlanningSource } from '@trame/api/scheduling/application';
import type { WeekPlanning } from '@trame/api/scheduling/domain';
import { OrganizationPlanningReader } from './organization-planning.reader';
import { StaffPlanningReader } from './staff-planning.reader';

/**
 * Répond au contexte `scheduling` par les use cases publics de `organization`, `demand` et
 * `staff`. L'adaptateur vit dans l'application, hors des contextes, qui ne s'importent pas entre
 * eux (AGENTS.md, règle 4).
 */
@Injectable()
export class WeekPlanningAdapter implements WeekPlanningSource {
  constructor(
    private readonly organization: OrganizationPlanningReader,
    private readonly staff: StaffPlanningReader,
    private readonly getWeeklyCoverage: GetWeeklyCoverage,
  ) {}

  async read(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<WeekPlanning | undefined> {
    const timeZone = await this.organization.timeZoneOf(organizationId, siteId);
    if (timeZone === undefined) {
      return undefined;
    }
    const coverage = await this.getWeeklyCoverage.execute({ organizationId, siteId, weekStartsOn });
    const needs = coverage?.needs ?? [];
    return {
      siteId,
      weekStartsOn,
      timeZone,
      shifts: await this.organization.shiftsOf(organizationId, siteId, needs),
      employees: await this.staff.employeesOf(organizationId, siteId),
    };
  }

  async hasSite(organizationId: string, siteId: string): Promise<boolean> {
    const timeZone = await this.organization.timeZoneOf(organizationId, siteId);
    return timeZone !== undefined;
  }
}
