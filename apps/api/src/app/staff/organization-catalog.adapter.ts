import { Injectable } from '@nestjs/common';
import {
  GetSite,
  GetSkill,
  SiteNotFoundError,
  SkillNotFoundError,
} from '@trame/api/organization/application';
import type { OrganizationCatalog } from '@trame/api/staff/application';
import { allExist, resourceExists } from '../context-ports/resource-exists';

/**
 * Répond aux questions du contexte `staff` sur le contexte `organization`, par les use cases
 * publics de ce dernier. L'adaptateur vit dans l'application, hors des contextes, qui ne
 * s'importent pas entre eux (AGENTS.md, règle 4).
 */
@Injectable()
export class OrganizationCatalogAdapter implements OrganizationCatalog {
  constructor(
    private readonly getSite: GetSite,
    private readonly getSkill: GetSkill,
  ) {}

  async hasSite(organizationId: string, siteId: string): Promise<boolean> {
    return resourceExists(
      () => this.getSite.execute({ organizationId, siteId }),
      [SiteNotFoundError],
    );
  }

  async timeZoneOfSite(organizationId: string, siteId: string): Promise<string | undefined> {
    try {
      const site = await this.getSite.execute({ organizationId, siteId });
      return site.timeZone.id;
    } catch (error) {
      if (error instanceof SiteNotFoundError) {
        return undefined;
      }
      throw error;
    }
  }

  async hasAllSkills(organizationId: string, skillIds: readonly string[]): Promise<boolean> {
    return allExist(skillIds, (skillId) =>
      resourceExists(
        () => this.getSkill.execute({ organizationId, skillId }),
        [SkillNotFoundError],
      ),
    );
  }
}
