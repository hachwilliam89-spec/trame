/**
 * Habilitation d'un employé : une compétence du catalogue de son organisation (par exemple un
 * CACES), avec sa fin de validité éventuelle. Le moteur seul décide si elle autorise un shift
 * (AGENTS.md, règle 5) : le domaine la conserve sans l'interpréter.
 */
export interface Qualification {
  readonly skillId: string;
  /** Dernier jour de validité, inclus. `undefined` : l'habilitation n'expire pas. */
  readonly expiresOn: Temporal.PlainDate | undefined;
}
