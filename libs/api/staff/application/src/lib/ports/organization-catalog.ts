/**
 * Ce que `staff` a besoin de savoir du contexte `organization`. Les contextes ne s'importent pas
 * (AGENTS.md, règle 4) : l'application assemble l'adaptateur, qui appelle les use cases publics
 * d'`organization`.
 */
export interface OrganizationCatalog {
  /** Vrai si le site existe dans cette organisation. */
  hasSite(organizationId: string, siteId: string): Promise<boolean>;

  /** Fuseau IANA du site (`Europe/Paris`). `undefined` : le site n'existe pas dans cette organisation. */
  timeZoneOfSite(organizationId: string, siteId: string): Promise<string | undefined>;

  /** Vrai si toutes ces compétences existent dans cette organisation. Vrai pour une liste vide. */
  hasAllSkills(organizationId: string, skillIds: readonly string[]): Promise<boolean>;
}
