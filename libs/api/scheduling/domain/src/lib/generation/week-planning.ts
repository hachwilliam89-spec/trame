/**
 * Ce que la génération lit des autres contextes pour une semaine d'un site, par le port
 * `WeekPlanningSource` : les instants viennent déjà du fuseau du site (contexte `organization`).
 */
export interface PlanningShift {
  /** Jour civil local du début du shift. */
  readonly date: Temporal.PlainDate;
  readonly shiftTemplateId: string;
  readonly positionId: string;
  readonly startsAt: Temporal.Instant;
  readonly endsAt: Temporal.Instant;
  /** Temps écoulé moins la pause, changement d'heure compris. */
  readonly effectiveMinutes: number;
  /** Compétences exigées par le poste. */
  readonly requiredSkillIds: readonly string[];
  readonly requiredCount: number;
}

export interface PlanningQualification {
  readonly skillId: string;
  /** Dernier jour de validité, inclus. `undefined` : sans expiration. */
  readonly expiresOn: Temporal.PlainDate | undefined;
}

export interface PlanningContract {
  readonly weeklyMinutesMin: number;
  readonly weeklyMinutesMax: number;
  readonly startsOn: Temporal.PlainDate;
  /** Dernier jour du contrat, inclus. `undefined` : sans fin prévue. */
  readonly endsOn: Temporal.PlainDate | undefined;
}

export interface PlanningEmployee {
  readonly id: string;
  readonly qualifications: readonly PlanningQualification[];
  readonly contracts: readonly PlanningContract[];
}

export interface WeekPlanning {
  readonly siteId: string;
  /** Lundi de la semaine. */
  readonly weekStartsOn: Temporal.PlainDate;
  /** Fuseau IANA du site. */
  readonly timeZone: string;
  /** Un shift par jour, créneau type et poste ayant un besoin. */
  readonly shifts: readonly PlanningShift[];
  /** Salariés du site, avec tous leurs contrats. */
  readonly employees: readonly PlanningEmployee[];
}
