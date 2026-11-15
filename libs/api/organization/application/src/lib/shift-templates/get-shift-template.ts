import type { ShiftTemplate } from '@trame/api/organization/domain';
import { ShiftTemplateNotFoundError } from '../not-found.errors';
import type { ShiftTemplateRepository } from '../ports/shift-template.repository';
import type { SiteRepository } from '../ports/site.repository';
import { findSiteOrThrow } from '../sites/find-site';

export interface GetShiftTemplateQuery {
  organizationId: string;
  siteId: string;
  shiftTemplateId: string;
}

/** Lit un créneau type d'un site de l'organisation. */
export class GetShiftTemplate {
  constructor(
    private readonly sites: SiteRepository,
    private readonly shiftTemplates: ShiftTemplateRepository,
  ) {}

  async execute(query: GetShiftTemplateQuery): Promise<ShiftTemplate> {
    const site = await findSiteOrThrow(this.sites, query.organizationId, query.siteId);
    const shiftTemplate = await this.shiftTemplates.findById(
      site.organizationId,
      site.id,
      query.shiftTemplateId,
    );
    if (shiftTemplate === undefined) {
      throw new ShiftTemplateNotFoundError();
    }
    return shiftTemplate;
  }
}
