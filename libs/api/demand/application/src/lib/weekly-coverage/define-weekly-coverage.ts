import { type CoverageNeed, WeeklyCoverage } from '@trame/api/demand/domain';
import type { Clock } from '@trame/platform/clock';
import { ensureSiteExists } from '../ensure-site-exists';
import { PositionNotFoundError, ShiftTemplateNotFoundError } from '../not-found.errors';
import type { SiteCatalog } from '../ports/site-catalog';
import type { WeeklyCoverageRepository } from '../ports/weekly-coverage.repository';

export interface DefineWeeklyCoverageCommand {
  organizationId: string;
  siteId: string;
  weekStartsOn: Temporal.PlainDate;
  needs: readonly CoverageNeed[];
}

/**
 * Définit les besoins de couverture d'un site pour une semaine, à la place de ceux qui existaient.
 * Les créneaux types et les postes doivent appartenir au site (US-050).
 */
export class DefineWeeklyCoverage {
  constructor(
    private readonly catalog: SiteCatalog,
    private readonly coverages: WeeklyCoverageRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: DefineWeeklyCoverageCommand): Promise<WeeklyCoverage> {
    await ensureSiteExists(this.catalog, command.organizationId, command.siteId);
    const coverage = WeeklyCoverage.create({ ...command, updatedAt: this.clock.now() });
    await this.ensureNeedsBelongToSite(coverage);
    await this.coverages.save(coverage);
    return coverage;
  }

  private async ensureNeedsBelongToSite(coverage: WeeklyCoverage): Promise<void> {
    const shiftTemplateIds = distinct(coverage.needs.map((need) => need.shiftTemplateId));
    const shiftTemplatesBelongToSite = await this.catalog.hasAllShiftTemplates(
      coverage.organizationId,
      coverage.siteId,
      shiftTemplateIds,
    );
    if (!shiftTemplatesBelongToSite) {
      throw new ShiftTemplateNotFoundError();
    }
    const positionIds = distinct(coverage.needs.map((need) => need.positionId));
    const positionsBelongToSite = await this.catalog.hasAllPositions(
      coverage.organizationId,
      coverage.siteId,
      positionIds,
    );
    if (!positionsBelongToSite) {
      throw new PositionNotFoundError();
    }
  }
}

function distinct(identifiers: readonly string[]): string[] {
  return [...new Set(identifiers)];
}
