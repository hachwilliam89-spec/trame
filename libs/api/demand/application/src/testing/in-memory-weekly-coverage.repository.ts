import type { WeeklyCoverage } from '@trame/api/demand/domain';
import type { WeeklyCoverageRepository } from '../lib/ports/weekly-coverage.repository';

/** Dépôt en mémoire, pour les tests. */
export class InMemoryWeeklyCoverageRepository implements WeeklyCoverageRepository {
  private readonly coverages = new Map<string, WeeklyCoverage>();

  async save(coverage: WeeklyCoverage): Promise<void> {
    const key = keyOf(coverage.organizationId, coverage.siteId, coverage.weekStartsOn);
    this.coverages.set(key, coverage);
  }

  async find(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<WeeklyCoverage | undefined> {
    return this.coverages.get(keyOf(organizationId, siteId, weekStartsOn));
  }
}

function keyOf(organizationId: string, siteId: string, weekStartsOn: Temporal.PlainDate): string {
  return `${organizationId}/${siteId}/${weekStartsOn.toString()}`.toLowerCase();
}
