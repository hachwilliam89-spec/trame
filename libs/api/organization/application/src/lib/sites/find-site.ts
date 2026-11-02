import type { Site } from '@trame/api/organization/domain';
import { SiteNotFoundError } from '../not-found.errors';
import type { SiteRepository } from '../ports/site.repository';

/** Charge un site de l'organisation, ou lève `SiteNotFoundError`. */
export async function findSiteOrThrow(
  sites: SiteRepository,
  organizationId: string,
  siteId: string,
): Promise<Site> {
  const site = await sites.findById(organizationId, siteId);
  if (site === undefined) {
    throw new SiteNotFoundError();
  }
  return site;
}
