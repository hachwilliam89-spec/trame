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

  /**
   * Enregistre la durée que `reference` donne au jour `day`, sans réécrire celles des autres
   * jours : deux managers qui valorisent deux jours en même temps gardent chacun la leur. Faux
   * si la référence n'existe plus.
   */
  saveDayValuation(reference: EqualShareReference, day: Temporal.PlainDate): Promise<boolean>;
}
