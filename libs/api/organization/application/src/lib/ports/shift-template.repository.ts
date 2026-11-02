import type { ShiftTemplate } from '@trame/api/organization/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';

/** Créneaux types enregistrés. Chaque lecture est limitée à une organisation et à un site. */
export interface ShiftTemplateRepository {
  /**
   * Enregistre un nouveau créneau type. Lève `ShiftTemplateLabelAlreadyUsedError` si un autre
   * créneau du site a pris ce libellé entre la vérification du use case et l'enregistrement.
   */
  add(shiftTemplate: ShiftTemplate): Promise<void>;

  existsWithLabel(organizationId: string, siteId: string, label: string): Promise<boolean>;

  /** `undefined` si le créneau n'existe pas pour ce site dans cette organisation. */
  findById(
    organizationId: string,
    siteId: string,
    shiftTemplateId: string,
  ): Promise<ShiftTemplate | undefined>;

  /** Créneaux types du site, par ordre de création. */
  listBySite(
    organizationId: string,
    siteId: string,
    page: PageRequest,
  ): Promise<Page<ShiftTemplate>>;
}
