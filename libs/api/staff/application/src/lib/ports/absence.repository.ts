import type { Absence } from '@trame/api/staff/domain';

/** Absences enregistrées. Chaque lecture et chaque écriture sont limitées à une organisation. */
export interface AbsenceRepository {
  add(absence: Absence): Promise<void>;

  /** `undefined` si l'absence n'existe pas dans cette organisation. */
  findById(organizationId: string, absenceId: string): Promise<Absence | undefined>;

  /** Remplace la période et le motif. Faux si l'absence n'existe plus dans son organisation. */
  update(absence: Absence): Promise<boolean>;

  /** Faux si l'absence n'existait pas dans cette organisation. */
  remove(organizationId: string, absenceId: string): Promise<boolean>;

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
}
