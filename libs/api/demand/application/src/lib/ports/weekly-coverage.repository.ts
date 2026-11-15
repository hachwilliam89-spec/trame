import type { WeeklyCoverage } from '@trame/api/demand/domain';

/** Besoins de couverture enregistrés, semaine par semaine. Chaque lecture est limitée à une organisation. */
export interface WeeklyCoverageRepository {
  /**
   * Enregistre la couverture de la semaine, à la place de celle qui existait pour ce site et
   * cette semaine. Le remplacement est atomique : deux enregistrements simultanés de la même
   * semaine passent l'un après l'autre.
   */
  save(coverage: WeeklyCoverage): Promise<void>;

  /** `undefined` si aucun besoin n'a jamais été défini pour ce site et cette semaine. */
  find(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<WeeklyCoverage | undefined>;
}
