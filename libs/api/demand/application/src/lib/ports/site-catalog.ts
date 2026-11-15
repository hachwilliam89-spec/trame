/**
 * Ce que `demand` a besoin de savoir du contexte `organization`. Les contextes ne s'importent pas
 * (AGENTS.md, règle 4) : l'application assemble l'adaptateur, qui appelle les use cases publics
 * d'`organization`.
 */
export interface SiteCatalog {
  /** Vrai si le site existe dans cette organisation. */
  hasSite(organizationId: string, siteId: string): Promise<boolean>;

  /** Vrai si tous ces créneaux types appartiennent au site. Vrai pour une liste vide. */
  hasAllShiftTemplates(
    organizationId: string,
    siteId: string,
    shiftTemplateIds: readonly string[],
  ): Promise<boolean>;

  /** Vrai si tous ces postes appartiennent au site. Vrai pour une liste vide. */
  hasAllPositions(
    organizationId: string,
    siteId: string,
    positionIds: readonly string[],
  ): Promise<boolean>;
}
