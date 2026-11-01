/**
 * Dépendance à vérifier avant d'envoyer du trafic à l'application (base, broker, moteur…).
 * `check()` se termine si la dépendance répond, et lève une erreur sinon.
 */
export interface ReadinessIndicator {
  /** Nom stable, repris dans la réponse (`database`, `rabbitmq`…). */
  readonly name: string;
  check(): Promise<void>;
}

/** Jeton d'injection de la liste des indicateurs enregistrés. */
export const READINESS_INDICATORS = Symbol('READINESS_INDICATORS');
