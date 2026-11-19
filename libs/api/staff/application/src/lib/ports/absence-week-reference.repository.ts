import type { AbsenceWeekReference, EqualShareReference } from '@trame/api/staff/domain';

/**
 * Références figées qui valorisent les absences d'un salarié sur une semaine. Elles s'écrivent
 * avec l'absence qui les fige (`AbsenceRepository`), une seule par salarié et par semaine.
 */
export interface AbsenceWeekReferenceRepository {
  /** `undefined` : aucune référence figée pour ce salarié cette semaine. */
  find(
    organizationId: string,
    employeeId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<AbsenceWeekReference | undefined>;

  /** Références des employés du site pour la semaine. */
  listBySite(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<AbsenceWeekReference[]>;

  /** Enregistre les durées données par le manager. Faux si la référence n'existe plus. */
  saveDayValuations(reference: EqualShareReference): Promise<boolean>;
}
