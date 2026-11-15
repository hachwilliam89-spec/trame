import { SiteNotFoundError } from './not-found.errors';
import type { SiteCatalog } from './ports/site-catalog';

/** Lève `SiteNotFoundError` si le site n'existe pas dans cette organisation. */
export async function ensureSiteExists(
  catalog: SiteCatalog,
  organizationId: string,
  siteId: string,
): Promise<void> {
  const siteExists = await catalog.hasSite(organizationId, siteId);
  if (!siteExists) {
    throw new SiteNotFoundError();
  }
}
