import { performance } from 'node:perf_hooks';
import type { Stopwatch } from './deadline';

/**
 * Horloge monotone du processus : elle ne recule ni ne saute quand l'heure du système change,
 * contrairement à l'heure courante (port `Clock`). C'est ce qu'il faut pour mesurer un délai.
 */
export function createSystemStopwatch(): Stopwatch {
  const startedAt = performance.now();
  return {
    elapsedMilliseconds: () => performance.now() - startedAt,
  };
}
