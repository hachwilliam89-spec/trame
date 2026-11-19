import { type Absence, weekBounds } from '@trame/api/staff/domain';
import { SiteNotFoundError } from '../not-found.errors';
import type { AbsenceRepository } from '../ports/absence.repository';
import type { OrganizationCatalog } from '../ports/organization-catalog';

export interface ListWeekAbsencesQuery {
  organizationId: string;
  siteId: string;
  /** Lundi de la semaine. */
  weekStartsOn: Temporal.PlainDate;
}

/**
 * Absences des employés d'un site qui touchent une semaine, du lundi 0 h au lundi suivant 0 h à
 * l'heure du site : celles qui la débordent sont comprises. Triées par début.
 */
export class ListWeekAbsences {
  constructor(
    private readonly catalog: OrganizationCatalog,
    private readonly absences: AbsenceRepository,
  ) {}

  async execute(query: ListWeekAbsencesQuery): Promise<Absence[]> {
    const timeZone = await this.catalog.timeZoneOfSite(query.organizationId, query.siteId);
    if (timeZone === undefined) {
      throw new SiteNotFoundError();
    }
    const { from, to } = weekBounds(query.weekStartsOn, timeZone);
    return this.absences.listBySiteOverlapping(query.organizationId, query.siteId, from, to);
  }
}
