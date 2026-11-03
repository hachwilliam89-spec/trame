import type { Position } from '@trame/api/organization/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';
import type { PositionRepository } from '../ports/position.repository';
import type { SiteRepository } from '../ports/site.repository';
import { findSiteOrThrow } from '../sites/find-site';

export interface ListPositionsQuery {
  organizationId: string;
  siteId: string;
  page: PageRequest;
}

/** Liste les postes d'un site de l'organisation, par ordre de création. */
export class ListPositions {
  constructor(
    private readonly sites: SiteRepository,
    private readonly positions: PositionRepository,
  ) {}

  async execute(query: ListPositionsQuery): Promise<Page<Position>> {
    await findSiteOrThrow(this.sites, query.organizationId, query.siteId);
    return this.positions.listBySite(query.organizationId, query.siteId, query.page);
  }
}
