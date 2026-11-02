import type { ShiftTemplate } from '@trame/api/organization/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';

/** Créneaux types enregistrés. Chaque lecture est limitée à une organisation et à un site. */
export interface ShiftTemplateRepository {
  add(shiftTemplate: ShiftTemplate): Promise<void>;

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
