import type { Position } from '@trame/api/organization/domain';
import { PositionNotFoundError } from '../not-found.errors';
import type { PositionRepository } from '../ports/position.repository';
import type { SiteRepository } from '../ports/site.repository';
import { findSiteOrThrow } from '../sites/find-site';

export interface GetPositionQuery {
  organizationId: string;
  siteId: string;
  positionId: string;
}

/** Lit un poste d'un site de l'organisation. */
export class GetPosition {
  constructor(
    private readonly sites: SiteRepository,
    private readonly positions: PositionRepository,
  ) {}

  async execute(query: GetPositionQuery): Promise<Position> {
    await findSiteOrThrow(this.sites, query.organizationId, query.siteId);
    const position = await this.positions.findById(
      query.organizationId,
      query.siteId,
      query.positionId,
    );
    if (position === undefined) {
      throw new PositionNotFoundError();
    }
    return position;
  }
}
