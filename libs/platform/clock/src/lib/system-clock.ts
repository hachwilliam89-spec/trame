import type { Clock } from './clock';

/**
 * Adaptateur d'horloge système. C'est le seul endroit du code autorisé à lire l'heure réelle
 * (règle ESLint `no-restricted-syntax`, exception déclarée dans `eslint.config.mjs`).
 */
export class SystemClock implements Clock {
  now(): Temporal.Instant {
    // Tronqué à la milliseconde : c'est la précision que stocke PostgreSQL (`timestamptz(3)`) et
    // celle des UUID v7. Un instant plus fin changerait entre la réponse de création et la relecture.
    return Temporal.Now.instant().round({ smallestUnit: 'millisecond', roundingMode: 'trunc' });
  }
}
