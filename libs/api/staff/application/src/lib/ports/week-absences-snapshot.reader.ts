import type { Absence, AbsenceWeekReference } from '@trame/api/staff/domain';

/** Absences et références d'un site, lues dans un même état de la base (US-033). */
export interface WeekAbsencesSnapshot {
  /** Absences des employés du site qui touchent `[from, to[`, triées par début puis identifiant. */
  readonly absences: readonly Absence[];
  /** Références figées des employés du site pour la semaine. */
  readonly references: readonly AbsenceWeekReference[];
}

/**
 * Lit ensemble les absences et les références d'une semaine : une génération ne doit pas mêler
 * deux versions d'une absence, l'une pour l'indisponibilité, l'autre pour sa valorisation.
 */
export interface WeekAbsencesSnapshotReader {
  read(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
    from: Temporal.Instant,
    to: Temporal.Instant,
  ): Promise<WeekAbsencesSnapshot>;
}
