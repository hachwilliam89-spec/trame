import type { WorkedShift } from '@trame/api/staff/domain';

/** Planning d'une semaine qui sert de référence à la valorisation des absences d'un salarié. */
export interface ReferencePlanning {
  /** Génération réussie qui a produit ce planning. */
  readonly generationId: string;
  /** Shifts que le salarié y tient, avec leurs pauses. Vide : il ne travaille pas cette semaine. */
  readonly workedShifts: readonly WorkedShift[];
}

/**
 * Ce que les contextes `scheduling` et `demand` savent d'une semaine, lu au moment où une
 * référence se fige. L'adaptateur est assemblé dans l'application (`apps/api`).
 */
export interface PlanningReferenceSource {
  /**
   * Dernière génération réussie de la semaine à cet instant, avec les shifts du salarié.
   * Une génération encore en cours n'en fait pas partie. `undefined` : aucune génération réussie.
   */
  latestPlanningOf(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
    employeeId: string,
  ): Promise<ReferencePlanning | undefined>;

  /** Jours de la semaine où le site a des besoins à couvrir, triés. */
  activityDaysOf(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<Temporal.PlainDate[]>;
}
