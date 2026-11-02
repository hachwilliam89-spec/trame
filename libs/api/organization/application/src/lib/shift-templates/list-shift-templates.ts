import type { ShiftTemplate } from '@trame/api/organization/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';
import type { ShiftTemplateRepository } from '../ports/shift-template.repository';
import type { SiteRepository } from '../ports/site.repository';
import { findSiteOrThrow } from '../sites/find-site';

export interface ListShiftTemplatesQuery {
  organizationId: string;
  siteId: string;
  page: PageRequest;
}

/** Liste les créneaux types d'un site, par ordre de création. */
export class ListShiftTemplates {
  constructor(
    private readonly sites: SiteRepository,
    private readonly shiftTemplates: ShiftTemplateRepository,
  ) {}

  async execute(query: ListShiftTemplatesQuery): Promise<Page<ShiftTemplate>> {
    // Un site d'une autre organisation donne 404, et non une liste vide.
    const site = await findSiteOrThrow(this.sites, query.organizationId, query.siteId);
    return this.shiftTemplates.listBySite(site.organizationId, site.id, query.page);
  }
}
