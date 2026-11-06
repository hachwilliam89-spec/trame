/** Temps écoulé depuis le lancement, sur une horloge monotone. */
export interface Stopwatch {
  elapsedMilliseconds(): number;
}

/** Échéance du script : le temps restant se mesure, il ne se déduit pas d'un nombre d'essais. */
export class Deadline {
  constructor(
    private readonly stopwatch: Stopwatch,
    private readonly budgetMilliseconds: number,
  ) {}

  remainingMilliseconds(): number {
    const remaining = this.budgetMilliseconds - this.stopwatch.elapsedMilliseconds();
    return Math.max(remaining, 0);
  }

  isExpired(): boolean {
    return this.remainingMilliseconds() === 0;
  }
}
