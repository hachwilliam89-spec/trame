import type { SiteCatalog } from '../lib/ports/site-catalog';

/** Catalogue en mémoire, pour les tests : les sites, créneaux et postes y sont déclarés à la main. */
export class InMemorySiteCatalog implements SiteCatalog {
  private readonly sites = new Set<string>();
  private readonly shiftTemplates = new Set<string>();
  private readonly positions = new Set<string>();

  addSite(organizationId: string, siteId: string): void {
    this.sites.add(keyOf(organizationId, siteId));
  }

  addShiftTemplate(organizationId: string, siteId: string, shiftTemplateId: string): void {
    this.shiftTemplates.add(keyOf(organizationId, siteId, shiftTemplateId));
  }

  addPosition(organizationId: string, siteId: string, positionId: string): void {
    this.positions.add(keyOf(organizationId, siteId, positionId));
  }

  async hasSite(organizationId: string, siteId: string): Promise<boolean> {
    return this.sites.has(keyOf(organizationId, siteId));
  }

  async hasAllShiftTemplates(
    organizationId: string,
    siteId: string,
    shiftTemplateIds: readonly string[],
  ): Promise<boolean> {
    return shiftTemplateIds.every((shiftTemplateId) =>
      this.shiftTemplates.has(keyOf(organizationId, siteId, shiftTemplateId)),
    );
  }

  async hasAllPositions(
    organizationId: string,
    siteId: string,
    positionIds: readonly string[],
  ): Promise<boolean> {
    return positionIds.every((positionId) =>
      this.positions.has(keyOf(organizationId, siteId, positionId)),
    );
  }
}

/** PostgreSQL compare les UUID sans tenir compte de la casse : le catalogue de test aussi. */
function keyOf(...identifiers: string[]): string {
  return identifiers.join('/').toLowerCase();
}
