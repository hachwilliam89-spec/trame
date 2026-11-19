/**
 * Une durée valorisée ne se donne que pour une semaine sans planning de référence, valorisée par
 * la convention des parts égales. Une semaine sur planning se valorise sans elle.
 */
export class NoEqualShareReferenceError extends Error {
  constructor() {
    super(
      "Pas de durée à donner : cette semaine n'est pas valorisée par la convention des parts égales.",
    );
    this.name = 'NoEqualShareReferenceError';
  }
}
