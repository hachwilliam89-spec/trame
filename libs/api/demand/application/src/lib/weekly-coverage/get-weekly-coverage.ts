import { type WeeklyCoverage, ensureWeekStartsOnMonday } from '@trame/api/demand/domain';
import { ensureSiteExists } from '../ensure-site-exists';
import type { SiteCatalog } from '../ports/site-catalog';
import type { WeeklyCoverageRepository } from '../ports/weekly-coverage.repository';

export interface GetWeeklyCoverageQuery {
  organizationId: string;
  siteId: string;
  /** Lundi de la semaine. */
  weekStartsOn: Temporal.PlainDate;
}

/**
 * Lit les besoins de couverture d'un site pour une semaine. `undefined` si aucun besoin n'a
 * jamais été défini pour cette semaine.
 */
export class GetWeeklyCoverage {
  constructor(
    private readonly catalog: SiteCatalog,
    private readonly coverages: WeeklyCoverageRepository,
  ) {}

  async execute(query: GetWeeklyCoverageQuery): Promise<WeeklyCoverage | undefined> {
    await ensureSiteExists(this.catalog, query.organizationId, query.siteId);
    ensureWeekStartsOnMonday(query.weekStartsOn);
    return this.coverages.find(query.organizationId, query.siteId, query.weekStartsOn);
  }
}
