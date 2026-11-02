import { InvalidBreakDurationError } from './shift-template.errors';

/** Pause d'un créneau : son heure de début, en heure locale du site, et sa durée. */
export class ShiftBreak {
  private constructor(
    readonly start: Temporal.PlainTime,
    readonly durationMinutes: number,
  ) {}

  static of(start: Temporal.PlainTime, durationMinutes: number): ShiftBreak {
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      throw new InvalidBreakDurationError();
    }
    return new ShiftBreak(start, durationMinutes);
  }
}
