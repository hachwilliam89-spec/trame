import { type Absence, type Employee, weeksTouchedBy } from '@trame/api/staff/domain';
import { SiteNotFoundError } from '../not-found.errors';
import type { OrganizationCatalog } from '../ports/organization-catalog';

/**
 * Semaines qu'une absence touche, à l'heure de son site (US-033). À la suppression ou à la
 * modification de l'absence, le dépôt verrouille la référence de chacune, relit ses jours
 * valorisés et efface la durée de ceux qu'aucune absence ne touche plus, dans la même
 * transaction : une durée enregistrée entre-temps par une autre requête est vue.
 */
export class AbsenceWeeksLookup {
  constructor(private readonly catalog: OrganizationCatalog) {}

  async touchedBy(employee: Employee, absence: Absence): Promise<Temporal.PlainDate[]> {
    const timeZone = await this.catalog.timeZoneOfSite(employee.organizationId, employee.siteId);
    if (timeZone === undefined) {
      throw new SiteNotFoundError();
    }
    return weeksTouchedBy(absence, timeZone);
  }
}
