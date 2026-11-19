import type { Absence, AbsenceWeekReference } from '@trame/api/staff/domain';

/** Absences enregistrées. Chaque lecture et chaque écriture sont limitées à une organisation. */
export interface AbsenceRepository {
  /**
   * Enregistre l'absence et, dans la même transaction, les références des semaines qu'elle fige.
   * Une référence déjà figée pour ce salarié et cette semaine, même par une écriture concurrente,
   * est gardée : la première l'emporte.
   */
  add(absence: Absence, referencesToFreeze: readonly AbsenceWeekReference[]): Promise<void>;

  /** `undefined` si l'absence n'existe pas dans cette organisation. */
  findById(organizationId: string, absenceId: string): Promise<Absence | undefined>;

  /**
   * Remplace la période et le motif, et fige les références comme `add`. Efface aussi, comme
   * `remove`, la durée des jours valorisés de `weeksBefore` (semaines que touchait l'absence)
   * qu'aucune absence de l'employé ne touche plus. Faux si l'absence n'existe plus dans son
   * organisation : rien n'est alors écrit.
   */
  update(
    absence: Absence,
    referencesToFreeze: readonly AbsenceWeekReference[],
    weeksBefore: readonly Temporal.PlainDate[],
  ): Promise<boolean>;

  /**
   * Supprime l'absence et, dans la même transaction, efface la durée de chaque jour valorisé des
   * semaines `weeks` qu'aucune autre absence de l'employé ne touche. La transaction verrouille
   * d'abord la référence de chaque semaine, puis relit ses jours valorisés et les absences : une
   * durée enregistrée, ou une absence du même jour supprimée, en même temps par une autre
   * requête est prise en compte. Faux si l'absence n'existait pas dans son organisation.
   */
  remove(absence: Absence, weeks: readonly Temporal.PlainDate[]): Promise<boolean>;

  /**
   * Absences des employés du site qui couvrent au moins un instant de `[from, to[`, triées par
   * début, puis par identifiant.
   */
  listBySiteOverlapping(
    organizationId: string,
    siteId: string,
    from: Temporal.Instant,
    to: Temporal.Instant,
  ): Promise<Absence[]>;

  /** Absences de l'employé qui couvrent au moins un instant de `[from, to[`, triées de même. */
  listByEmployeeOverlapping(
    organizationId: string,
    employeeId: string,
    from: Temporal.Instant,
    to: Temporal.Instant,
  ): Promise<Absence[]>;
}
