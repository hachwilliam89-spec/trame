import {
  type Absence,
  type AbsenceWeekReference,
  type Employee,
  EqualShareReference,
  PlanningReference,
  weeksTouchedBy,
} from '@trame/api/staff/domain';
import { SiteNotFoundError } from '../not-found.errors';
import type { AbsenceWeekReferenceRepository } from '../ports/absence-week-reference.repository';
import type { ContractRepository } from '../ports/contract.repository';
import type { OrganizationCatalog } from '../ports/organization-catalog';
import type { PlanningReferenceSource } from '../ports/planning-reference-source';

/**
 * Choisit, à la déclaration ou à la modification d'une absence, la référence qui valorisera
 * chaque semaine qu'elle touche et qui n'en a pas encore (US-033) :
 * 1. la dernière génération réussie de la semaine, à cet instant ;
 * 2. sinon, la convention des parts égales, si le site a des besoins cette semaine et qu'un
 *    contrat du salarié la couvre entière ;
 * 3. sinon rien : la valorisation reste « à définir », et sera retentée à la saisie suivante.
 */
export class AbsenceWeekReferenceFreezer {
  constructor(
    private readonly catalog: OrganizationCatalog,
    private readonly contracts: ContractRepository,
    private readonly references: AbsenceWeekReferenceRepository,
    private readonly source: PlanningReferenceSource,
  ) {}

  /** Références à figer avec l'absence, pour les semaines qui n'en ont pas encore. */
  async referencesToFreeze(
    employee: Employee,
    absence: Absence,
    frozenAt: Temporal.Instant,
  ): Promise<AbsenceWeekReference[]> {
    const timeZone = await this.catalog.timeZoneOfSite(employee.organizationId, employee.siteId);
    if (timeZone === undefined) {
      throw new SiteNotFoundError();
    }
    const toFreeze: AbsenceWeekReference[] = [];
    for (const weekStartsOn of weeksTouchedBy(absence, timeZone)) {
      const existing = await this.references.find(
        employee.organizationId,
        employee.id,
        weekStartsOn,
      );
      if (existing !== undefined) {
        continue;
      }
      const reference = await this.referenceFor(employee, weekStartsOn, timeZone, frozenAt);
      if (reference !== undefined) {
        toFreeze.push(reference);
      }
    }
    return toFreeze;
  }

  private async referenceFor(
    employee: Employee,
    weekStartsOn: Temporal.PlainDate,
    timeZone: string,
    frozenAt: Temporal.Instant,
  ): Promise<AbsenceWeekReference | undefined> {
    const frozen = {
      organizationId: employee.organizationId,
      employeeId: employee.id,
      weekStartsOn,
      frozenAt,
    };
    const planning = await this.source.latestPlanningOf(
      employee.organizationId,
      employee.siteId,
      weekStartsOn,
      employee.id,
    );
    if (planning !== undefined) {
      return PlanningReference.freeze({ ...frozen, ...planning });
    }
    const activityDays = await this.source.activityDaysOf(
      employee.organizationId,
      employee.siteId,
      weekStartsOn,
    );
    if (activityDays.length === 0) {
      return undefined;
    }
    const contract = await this.contracts.findCoveringWeek(
      employee.organizationId,
      employee.id,
      weekStartsOn,
    );
    if (contract === undefined) {
      return undefined;
    }
    return EqualShareReference.freeze({
      ...frozen,
      timeZone,
      weeklyMinimumMinutes: contract.weeklyMinutesMin,
      activityDays,
    });
  }
}
