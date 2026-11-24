import type { AbsenceWeekReference, EqualShareReference } from '@trame/api/staff/domain';

/**
 * Issue de l'enregistrement d'une durée : depuis la lecture du use case, la référence a pu
 * disparaître, ou le jour perdre sa dernière absence.
 */
export type DayValuationSaveOutcome = 'SAVED' | 'REFERENCE_NOT_FOUND' | 'DAY_WITHOUT_ABSENCE';

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
   * Fige ces références, sauf pour un salarié et une semaine qui en ont déjà une : la première
   * figée, même par une requête concurrente, est gardée.
   */
  saveIfAbsent(references: readonly AbsenceWeekReference[]): Promise<void>;

  /**
   * Enregistre la durée que `reference` donne au jour `day`, sans réécrire celles des autres
   * jours : deux managers qui valorisent deux jours en même temps gardent chacun la leur. Rien
   * n'est écrit si le jour n'a plus d'absence au moment de l'écriture.
   */
  saveDayValuation(
    reference: EqualShareReference,
    day: Temporal.PlainDate,
  ): Promise<DayValuationSaveOutcome>;
}
