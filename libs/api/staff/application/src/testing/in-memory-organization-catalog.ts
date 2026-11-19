import type { OrganizationCatalog } from '../lib/ports/organization-catalog';

/** Catalogue en mémoire, pour les tests : les sites et les compétences y sont déclarés à la main. */
export class InMemoryOrganizationCatalog implements OrganizationCatalog {
  /** Fuseau de chaque site, par organisation et site. */
  private readonly sites = new Map<string, string>();
  private readonly skills = new Set<string>();

  addSite(organizationId: string, siteId: string, timeZone = 'Europe/Paris'): void {
    this.sites.set(keyOf(organizationId, siteId), timeZone);
  }

  addSkill(organizationId: string, skillId: string): void {
    this.skills.add(keyOf(organizationId, skillId));
  }

  async hasSite(organizationId: string, siteId: string): Promise<boolean> {
    return this.sites.has(keyOf(organizationId, siteId));
  }

  async timeZoneOfSite(organizationId: string, siteId: string): Promise<string | undefined> {
    return this.sites.get(keyOf(organizationId, siteId));
  }

  async hasAllSkills(organizationId: string, skillIds: readonly string[]): Promise<boolean> {
    return skillIds.every((skillId) => this.skills.has(keyOf(organizationId, skillId)));
  }
}

/** PostgreSQL compare les UUID sans tenir compte de la casse : le catalogue de test aussi. */
function keyOf(organizationId: string, resourceId: string): string {
  return `${organizationId}/${resourceId}`.toLowerCase();
}
