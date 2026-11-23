import {
  type Absence,
  type AbsenceValuation,
  type AbsenceWeekReference,
  valueAbsencesOfWeek,
  weekBounds,
} from '@trame/api/staff/domain';
import { SiteNotFoundError } from '../not-found.errors';
import type { AbsenceWeekReferenceRepository } from '../ports/absence-week-reference.repository';
import type { AbsenceRepository } from '../ports/absence.repository';
import type { OrganizationCatalog } from '../ports/organization-catalog';

export interface GetWeekAbsenceValuationsQuery {
  organizationId: string;
  siteId: string;
  /** Lundi de la semaine. */
  weekStartsOn: Temporal.PlainDate;
}

/** Valorisation des absences d'un employé sur la semaine, et la référence qui la fonde. */
export interface EmployeeAbsenceValuation {
  readonly employeeId: string;
  /** `undefined` : aucune référence figée, la valorisation reste « à définir ». */
  readonly reference: AbsenceWeekReference | undefined;
  readonly valuation: AbsenceValuation;
}

/**
 * Valorise les absences de chaque employé du site qui en a dans la semaine (US-033). Les
 * générations s'en servent pour le minimum restant, et l'écran pour les heures d'absence.
 * Triées par employé.
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
    const valuations: EmployeeAbsenceValuation[] = [];
    for (const [employeeId, absencesOfEmployee] of groupByEmployee(absences)) {
      const reference = references.find((candidate) => candidate.employeeId === employeeId);
      valuations.push({
        employeeId,
        reference,
        valuation: valueAbsencesOfWeek(reference, absencesOfEmployee),
      });
    }
    return valuations.sort((first, second) => first.employeeId.localeCompare(second.employeeId));
  }
}

function groupByEmployee(absences: readonly Absence[]): Map<string, Absence[]> {
  const byEmployee = new Map<string, Absence[]>();
  for (const absence of absences) {
    const absencesOfEmployee = byEmployee.get(absence.employeeId) ?? [];
    absencesOfEmployee.push(absence);
    byEmployee.set(absence.employeeId, absencesOfEmployee);
  }
  return byEmployee;
}
