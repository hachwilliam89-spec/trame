import type { ShiftDurations } from '@trame/api/organization/domain';
import { ShiftTemplateNotFoundError } from '../not-found.errors';
import type { ShiftTemplateRepository } from '../ports/shift-template.repository';
import type { SiteRepository } from '../ports/site.repository';
import { findSiteOrThrow } from '../sites/find-site';

export interface GetShiftTemplateDurationsQuery {
  organizationId: string;
  siteId: string;
  shiftTemplateId: string;
  /** Date de début du créneau, dans le calendrier du site. */
  date: Temporal.PlainDate;
}

/** Calcule les durées réelles d'un créneau type à une date donnée, dans le fuseau de son site. */
export class GetShiftTemplateDurations {
  constructor(
    private readonly sites: SiteRepository,
    private readonly shiftTemplates: ShiftTemplateRepository,
  ) {}

  async execute(query: GetShiftTemplateDurationsQuery): Promise<ShiftDurations> {
    const site = await findSiteOrThrow(this.sites, query.organizationId, query.siteId);

    const shiftTemplate = await this.shiftTemplates.findById(
      site.organizationId,
      site.id,
      query.shiftTemplateId,
    );
    if (shiftTemplate === undefined) {
      throw new ShiftTemplateNotFoundError();
    }

    return shiftTemplate.durationsOn(query.date, site.timeZone);
  }
}
