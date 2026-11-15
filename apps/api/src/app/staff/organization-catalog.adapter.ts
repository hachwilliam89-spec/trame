import { Injectable } from '@nestjs/common';
import {
  GetSite,
  GetSkill,
  SiteNotFoundError,
  SkillNotFoundError,
} from '@trame/api/organization/application';
import type { OrganizationCatalog } from '@trame/api/staff/application';

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
    try {
      await this.getSite.execute({ organizationId, siteId });
      return true;
    } catch (error) {
      if (error instanceof SiteNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  async hasAllSkills(organizationId: string, skillIds: readonly string[]): Promise<boolean> {
    for (const skillId of skillIds) {
      const skillExists = await this.hasSkill(organizationId, skillId);
      if (!skillExists) {
        return false;
      }
    }
    return true;
  }

  private async hasSkill(organizationId: string, skillId: string): Promise<boolean> {
    try {
      await this.getSkill.execute({ organizationId, skillId });
      return true;
    } catch (error) {
      if (error instanceof SkillNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}
