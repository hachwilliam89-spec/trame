import { weekBounds } from '@trame/api/staff/domain';
import { SiteNotFoundError } from '../not-found.errors';
import type { AbsenceWeekReferenceRepository } from '../ports/absence-week-reference.repository';
import type { AbsenceRepository } from '../ports/absence.repository';
import type { OrganizationCatalog } from '../ports/organization-catalog';
import { type EmployeeAbsenceValuation, valuationsOf } from './week-absence-valuations';

export type { EmployeeAbsenceValuation } from './week-absence-valuations';

export interface GetWeekAbsenceValuationsQuery {
  organizationId: string;
  siteId: string;
  /** Lundi de la semaine. */
  weekStartsOn: Temporal.PlainDate;
}

/**
 * Valorise les absences de chaque employé du site qui en a dans la semaine (US-033), pour les
 * heures d'absence de l'écran. Triées par employé.
 */
export class GetWeekAbsenceValuations {
  constructor(
    private readonly catalog: OrganizationCatalog,
    private readonly absences: AbsenceRepository,
    private readonly references: AbsenceWeekReferenceRepository,
  ) {}

  async execute(query: GetWeekAbsenceValuationsQuery): Promise<EmployeeAbsenceValuation[]> {
    const timeZone = await this.catalog.timeZoneOfSite(query.organizationId, query.siteId);
    if (timeZone === undefined) {
      throw new SiteNotFoundError();
    }
    const { from, to } = weekBounds(query.weekStartsOn, timeZone);
    const absences = await this.absences.listBySiteOverlapping(
      query.organizationId,
      query.siteId,
      from,
      to,
    );
    const references = await this.references.listBySite(
      query.organizationId,
      query.siteId,
      query.weekStartsOn,
    );
    return valuationsOf(absences, references);
  }
}
