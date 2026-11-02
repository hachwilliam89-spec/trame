import type { Site } from '@trame/api/organization/domain';
import type { SiteRepository } from '../ports/site.repository';
import { findSiteOrThrow } from './find-site';

export interface GetSiteQuery {
  organizationId: string;
  siteId: string;
}

/** Lit un site de l'organisation. */
export class GetSite {
  constructor(private readonly sites: SiteRepository) {}

  execute(query: GetSiteQuery): Promise<Site> {
    return findSiteOrThrow(this.sites, query.organizationId, query.siteId);
  }
}
