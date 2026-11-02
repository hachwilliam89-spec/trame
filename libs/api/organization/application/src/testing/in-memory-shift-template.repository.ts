import {
  type ShiftTemplate,
  ShiftTemplateLabelAlreadyUsedError,
} from '@trame/api/organization/domain';
import { type Page, type PageRequest, pageOfSorted } from '@trame/platform/pagination';
import type { ShiftTemplateRepository } from '../lib/ports/shift-template.repository';

/** Dépôt en mémoire, pour les tests. Il applique la même contrainte d'unicité que la base. */
export class InMemoryShiftTemplateRepository implements ShiftTemplateRepository {
  private readonly shiftTemplates: ShiftTemplate[] = [];

  async add(shiftTemplate: ShiftTemplate): Promise<void> {
    const { organizationId, siteId, label } = shiftTemplate;
    if (await this.existsWithLabel(organizationId, siteId, label)) {
      throw new ShiftTemplateLabelAlreadyUsedError(label);
    }
    this.shiftTemplates.push(shiftTemplate);
  }

  async existsWithLabel(organizationId: string, siteId: string, label: string): Promise<boolean> {
    return this.ofSite(organizationId, siteId).some(
      (shiftTemplate) => shiftTemplate.label === label,
    );
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
    const sortedById = this.ofSite(organizationId, siteId).toSorted((left, right) =>
      left.id.localeCompare(right.id),
    );
    return pageOfSorted(sortedById, page);
  }

  private ofSite(organizationId: string, siteId: string): ShiftTemplate[] {
    return this.shiftTemplates.filter(
      (shiftTemplate) =>
        shiftTemplate.organizationId === organizationId && shiftTemplate.siteId === siteId,
    );
  }
}
