import { SiteNotFoundError } from './not-found.errors';
import type { OrganizationCatalog } from './ports/organization-catalog';

/** Lève `SiteNotFoundError` si le site n'existe pas dans cette organisation. */
export async function ensureSiteExists(
  catalog: OrganizationCatalog,
  organizationId: string,
  siteId: string,
): Promise<void> {
  const siteExists = await catalog.hasSite(organizationId, siteId);
  if (!siteExists) {
    throw new SiteNotFoundError();
  }
}
