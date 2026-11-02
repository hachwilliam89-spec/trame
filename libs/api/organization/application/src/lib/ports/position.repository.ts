import type { Position } from '@trame/api/organization/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';

export interface PositionRepository {
  /** Enregistre le poste et toutes ses compétences atomiquement, ou ne conserve rien. */
  add(position: Position): Promise<void>;
  findById(
    organizationId: string,
    siteId: string,
    positionId: string,
  ): Promise<Position | undefined>;
  listBySite(organizationId: string, siteId: string, page: PageRequest): Promise<Page<Position>>;
}
