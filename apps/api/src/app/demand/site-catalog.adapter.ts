import { Injectable } from '@nestjs/common';
import type { SiteCatalog } from '@trame/api/demand/application';
import {
  GetPosition,
  GetShiftTemplate,
  GetSite,
  PositionNotFoundError,
  ShiftTemplateNotFoundError,
  SiteNotFoundError,
} from '@trame/api/organization/application';
import { allExist, resourceExists } from '../context-ports/resource-exists';

/**
 * Répond aux questions du contexte `demand` sur le contexte `organization`, par les use cases
 * publics de ce dernier. L'adaptateur vit dans l'application, hors des contextes, qui ne
 * s'importent pas entre eux (AGENTS.md, règle 4).
 */
@Injectable()
export class SiteCatalogAdapter implements SiteCatalog {
  constructor(
    private readonly getSite: GetSite,
    private readonly getShiftTemplate: GetShiftTemplate,
    private readonly getPosition: GetPosition,
  ) {}

  async hasSite(organizationId: string, siteId: string): Promise<boolean> {
    return resourceExists(
      () => this.getSite.execute({ organizationId, siteId }),
      [SiteNotFoundError],
    );
  }

  async hasAllShiftTemplates(
    organizationId: string,
    siteId: string,
    shiftTemplateIds: readonly string[],
  ): Promise<boolean> {
    return allExist(shiftTemplateIds, (shiftTemplateId) =>
      resourceExists(
        () => this.getShiftTemplate.execute({ organizationId, siteId, shiftTemplateId }),
        // Un site inconnu de l'organisation ne possède aucun créneau type.
        [ShiftTemplateNotFoundError, SiteNotFoundError],
      ),
    );
  }

  async hasAllPositions(
    organizationId: string,
    siteId: string,
    positionIds: readonly string[],
  ): Promise<boolean> {
    return allExist(positionIds, (positionId) =>
      resourceExists(
        () => this.getPosition.execute({ organizationId, siteId, positionId }),
        // Un site inconnu de l'organisation ne possède aucun poste.
        [PositionNotFoundError, SiteNotFoundError],
      ),
    );
  }
}
