import type { OrganizationCatalog } from '../lib/ports/organization-catalog';

/** Catalogue en mémoire, pour les tests : les sites et les compétences y sont déclarés à la main. */
export class InMemoryOrganizationCatalog implements OrganizationCatalog {
  private readonly sites = new Set<string>();
  private readonly skills = new Set<string>();

  addSite(organizationId: string, siteId: string): void {
    this.sites.add(keyOf(organizationId, siteId));
  }

  addSkill(organizationId: string, skillId: string): void {
    this.skills.add(keyOf(organizationId, skillId));
  }

  async hasSite(organizationId: string, siteId: string): Promise<boolean> {
    return this.sites.has(keyOf(organizationId, siteId));
  }

  async hasAllSkills(organizationId: string, skillIds: readonly string[]): Promise<boolean> {
    return skillIds.every((skillId) => this.skills.has(keyOf(organizationId, skillId)));
  }
}

/** PostgreSQL compare les UUID sans tenir compte de la casse : le catalogue de test aussi. */
function keyOf(organizationId: string, resourceId: string): string {
  return `${organizationId}/${resourceId}`.toLowerCase();
}
