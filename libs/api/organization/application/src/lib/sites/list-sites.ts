import type { Site } from '@trame/api/organization/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';
import type { SiteRepository } from '../ports/site.repository';

export interface ListSitesQuery {
  organizationId: string;
  page: PageRequest;
}

/** Liste les sites de l'organisation, par ordre de création. */
export class ListSites {
  constructor(private readonly sites: SiteRepository) {}

  execute(query: ListSitesQuery): Promise<Page<Site>> {
    return this.sites.list(query.organizationId, query.page);
  }
}
