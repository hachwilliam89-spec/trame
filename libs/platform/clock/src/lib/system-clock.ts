import type { Clock } from './clock';

/**
 * Adaptateur d'horloge système. C'est le seul endroit du code autorisé à lire l'heure réelle
 * (règle ESLint `no-restricted-syntax`, exception déclarée dans `eslint.config.mjs`).
 */
export class SystemClock implements Clock {
  now(): Temporal.Instant {
    return Temporal.Now.instant();
  }
}
