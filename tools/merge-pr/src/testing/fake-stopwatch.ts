import type { Stopwatch } from '../lib/deadline';

/** Horloge monotone simulée : le temps n'avance que quand un test le décide. */
export class FakeStopwatch implements Stopwatch {
  private elapsed = 0;

  elapsedMilliseconds(): number {
    return this.elapsed;
  }

  advance(milliseconds: number): void {
    this.elapsed += milliseconds;
  }
}
