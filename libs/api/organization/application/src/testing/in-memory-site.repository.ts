import { type Site, type SiteCode, SiteCodeAlreadyUsedError } from '@trame/api/organization/domain';
import { type Page, type PageRequest, pageOf } from '@trame/platform/pagination';
import type { SiteRepository } from '../lib/ports/site.repository';

/** Dépôt en mémoire, pour les tests. Il applique la même contrainte d'unicité que la base. */
export class InMemorySiteRepository implements SiteRepository {
  private readonly sites: Site[] = [];

  async add(site: Site): Promise<void> {
    if (await this.existsWithCode(site.organizationId, site.code)) {
      throw new SiteCodeAlreadyUsedError(site.code.value);
    }
    this.sites.push(site);
  }

  async existsWithCode(organizationId: string, code: SiteCode): Promise<boolean> {
    return this.sites.some(
      (site) => site.organizationId === organizationId && site.code.equals(code),
    );
  }

  async findById(organizationId: string, siteId: string): Promise<Site | undefined> {
    return this.sites.find((site) => site.organizationId === organizationId && site.id === siteId);
  }

  async list(organizationId: string, page: PageRequest): Promise<Page<Site>> {
    const ofOrganization = this.sites.filter((site) => site.organizationId === organizationId);
    return pageOf(ofOrganization, page);
  }
}
