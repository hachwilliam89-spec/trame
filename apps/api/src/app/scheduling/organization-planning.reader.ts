import { Injectable } from '@nestjs/common';
import {
  GetPosition,
  GetShiftTemplateDurations,
  GetSite,
  SiteNotFoundError,
} from '@trame/api/organization/application';
import type { PlanningShift } from '@trame/api/scheduling/domain';

/** Un besoin de la semaine, tel que le contexte `demand` le décrit. */
export interface WeekNeed {
  readonly date: Temporal.PlainDate;
  readonly shiftTemplateId: string;
  readonly positionId: string;
  readonly requiredCount: number;
}

/** Lit dans le contexte `organization` le fuseau du site, les horaires et les postes des besoins. */
@Injectable()
export class OrganizationPlanningReader {
  constructor(
    private readonly getSite: GetSite,
    private readonly getPosition: GetPosition,
    private readonly getShiftTemplateDurations: GetShiftTemplateDurations,
  ) {}

  /** `undefined` : le site n'existe pas dans cette organisation. */
  async timeZoneOf(organizationId: string, siteId: string): Promise<string | undefined> {
    try {
      const site = await this.getSite.execute({ organizationId, siteId });
      return site.timeZone.id;
    } catch (error) {
      if (error instanceof SiteNotFoundError) {
        return undefined;
      }
      throw error;
    }
  }

  async shiftsOf(
    organizationId: string,
    siteId: string,
    needs: readonly WeekNeed[],
  ): Promise<PlanningShift[]> {
    const skillsByPosition = new Map<string, readonly string[]>();
    const shifts: PlanningShift[] = [];
    for (const need of needs) {
      let requiredSkillIds = skillsByPosition.get(need.positionId);
      if (requiredSkillIds === undefined) {
        const position = await this.getPosition.execute({
          organizationId,
          siteId,
          positionId: need.positionId,
        });
        requiredSkillIds = position.skillIds;
        skillsByPosition.set(need.positionId, requiredSkillIds);
      }
      shifts.push(await this.shiftOf(organizationId, siteId, need, requiredSkillIds));
    }
    return shifts;
  }

  /** Les instants et le temps effectif du créneau ce jour-là, changement d'heure compris. */
  private async shiftOf(
    organizationId: string,
    siteId: string,
    need: WeekNeed,
    requiredSkillIds: readonly string[],
  ): Promise<PlanningShift> {
    const durations = await this.getShiftTemplateDurations.execute({
      organizationId,
      siteId,
      shiftTemplateId: need.shiftTemplateId,
      date: need.date,
    });
    return {
      date: need.date,
      shiftTemplateId: need.shiftTemplateId,
      positionId: need.positionId,
      startsAt: durations.startsAt,
      endsAt: durations.endsAt,
      effectiveMinutes: durations.effectiveMinutes,
      requiredSkillIds,
      requiredCount: need.requiredCount,
    };
  }
}
