import type { ShiftTemplate } from '@trame/api/organization/domain';
import { type Page, type PageRequest, pageOf } from '@trame/platform/pagination';
import type { ShiftTemplateRepository } from '../lib/ports/shift-template.repository';

/** Dépôt en mémoire, pour les tests. */
export class InMemoryShiftTemplateRepository implements ShiftTemplateRepository {
  private readonly shiftTemplates: ShiftTemplate[] = [];

  async add(shiftTemplate: ShiftTemplate): Promise<void> {
    this.shiftTemplates.push(shiftTemplate);
  }

  async findById(
    organizationId: string,
    siteId: string,
    shiftTemplateId: string,
  ): Promise<ShiftTemplate | undefined> {
    return this.ofSite(organizationId, siteId).find(
      (shiftTemplate) => shiftTemplate.id === shiftTemplateId,
    );
  }

  async listBySite(
    organizationId: string,
    siteId: string,
    page: PageRequest,
  ): Promise<Page<ShiftTemplate>> {
    return pageOf(this.ofSite(organizationId, siteId), page);
  }

  private ofSite(organizationId: string, siteId: string): ShiftTemplate[] {
    return this.shiftTemplates.filter(
      (shiftTemplate) =>
        shiftTemplate.organizationId === organizationId && shiftTemplate.siteId === siteId,
    );
  }
}
