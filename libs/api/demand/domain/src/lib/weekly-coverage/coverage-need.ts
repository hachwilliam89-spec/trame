/**
 * Besoin de couverture : le nombre de personnes requises un jour donné, sur un créneau type et
 * un poste du site. Le domaine le conserve sans chercher à le couvrir : c'est le moteur qui
 * affecte les personnes et chiffre le manque (AGENTS.md, règle 5).
 */
export interface CoverageNeed {
  /** Jour du créneau, dans le calendrier du site. */
  readonly date: Temporal.PlainDate;
  readonly shiftTemplateId: string;
  readonly positionId: string;
  readonly requiredCount: number;
}
