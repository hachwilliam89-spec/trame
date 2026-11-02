import type { IdGenerator } from './id-generator';

/**
 * Générateur prévisible pour les tests : des UUID valides et croissants,
 * 00000000-0000-7000-8000-000000000001, puis …002, etc.
 */
export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  next(): string {
    this.counter += 1;
    const suffix = this.counter.toString(16).padStart(12, '0');
    return `00000000-0000-7000-8000-${suffix}`;
  }
}
