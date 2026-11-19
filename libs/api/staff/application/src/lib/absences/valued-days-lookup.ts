import {
  type Absence,
  type Employee,
  EqualShareReference,
  type ValuedDay,
  weeksTouchedBy,
} from '@trame/api/staff/domain';
import { SiteNotFoundError } from '../not-found.errors';
import type { AbsenceWeekReferenceRepository } from '../ports/absence-week-reference.repository';
import type { OrganizationCatalog } from '../ports/organization-catalog';

/**
 * Jours valorisés des semaines qu'une absence touche (US-033). À la suppression ou à la
 * modification de l'absence, le dépôt efface, dans la même transaction, la durée de ceux
 * qu'aucune absence ne touche plus : une absence saisie plus tard aux mêmes heures ne reprend
 * pas une durée donnée pour une autre.
 */
export class ValuedDaysLookup {
  constructor(
    private readonly catalog: OrganizationCatalog,
    private readonly references: AbsenceWeekReferenceRepository,
  ) {}

  async touchedBy(employee: Employee, absence: Absence): Promise<ValuedDay[]> {
    const timeZone = await this.catalog.timeZoneOfSite(employee.organizationId, employee.siteId);
    if (timeZone === undefined) {
      throw new SiteNotFoundError();
    }
    const valuedDays: ValuedDay[] = [];
    for (const weekStartsOn of weeksTouchedBy(absence, timeZone)) {
      const reference = await this.references.find(
        employee.organizationId,
        employee.id,
        weekStartsOn,
      );
      if (reference instanceof EqualShareReference) {
        valuedDays.push(...reference.valuedDays());
      }
    }
    return valuedDays;
  }
}
