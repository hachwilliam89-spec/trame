import type { Clock } from './clock';

/** Horloge figée pour les tests : l'heure n'avance que sur demande. */
export class FixedClock implements Clock {
  #instant: Temporal.Instant;

  constructor(instant: Temporal.Instant | string) {
    this.#instant = typeof instant === 'string' ? Temporal.Instant.from(instant) : instant;
  }

  now(): Temporal.Instant {
    return this.#instant;
  }

  set(instant: Temporal.Instant | string): void {
    this.#instant = typeof instant === 'string' ? Temporal.Instant.from(instant) : instant;
  }

  advance(duration: Temporal.DurationLike): void {
    this.#instant = this.#instant.add(duration);
  }
}
