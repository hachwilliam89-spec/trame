import type { Absence } from './absence';
import {
  type AbsenceValuation,
  type AbsenceWeekReference,
  type FrozenReferenceProperties,
  absentPeriodsOf,
} from './absence-week-reference';
import { type InstantInterval, isWithin, minutesCoveredBy } from './instant-interval';

/** Un shift tenu par le salarié dans le planning de référence, avec ses pauses, en instants. */
export interface WorkedShift {
  readonly startsAt: Temporal.Instant;
  /** Fin du shift, exclue. */
  readonly endsAt: Temporal.Instant;
  /** Pauses comprises dans le shift : leur temps n'est pas du travail, donc pas une absence. */
  readonly breaks: readonly InstantInterval[];
}

export interface PlanningReferenceProperties extends FrozenReferenceProperties {
  /** Génération réussie qui sert de planning de référence. */
  generationId: string;
  workedShifts: readonly WorkedShift[];
}

/**
 * Valorise sur le planning de référence : le temps des shifts tenus que l'absence couvre, moins
 * les pauses qu'elle recouvre réellement, sans prorata. Une absence sur un repos ne vaut rien.
 */
export class PlanningReference implements AbsenceWeekReference {
  readonly method = 'REFERENCE_PLANNING';
  readonly organizationId: string;
  readonly employeeId: string;
  readonly weekStartsOn: Temporal.PlainDate;
  readonly frozenAt: Temporal.Instant;
  readonly generationId: string;
  readonly workedShifts: readonly WorkedShift[];

  private constructor(properties: PlanningReferenceProperties) {
    this.organizationId = properties.organizationId;
    this.employeeId = properties.employeeId;
    this.weekStartsOn = properties.weekStartsOn;
    this.frozenAt = properties.frozenAt;
    this.generationId = properties.generationId;
    this.workedShifts = properties.workedShifts;
  }

  static freeze(properties: PlanningReferenceProperties): PlanningReference {
    for (const shift of properties.workedShifts) {
      ensureBreaksWithinShift(shift);
    }
    return new PlanningReference(properties);
  }

  value(absences: readonly Absence[]): AbsenceValuation {
    const absent = absentPeriodsOf(absences);
    let absenceMinutes = 0;
    for (const shift of this.workedShifts) {
      absenceMinutes += minutesCoveredBy(absent, { start: shift.startsAt, end: shift.endsAt });
      for (const shiftBreak of shift.breaks) {
        absenceMinutes -= minutesCoveredBy(absent, shiftBreak);
      }
    }
    return { status: 'VALUED', absenceMinutes };
  }
}

function ensureBreaksWithinShift(shift: WorkedShift): void {
  const shiftPeriod: InstantInterval = { start: shift.startsAt, end: shift.endsAt };
  for (const shiftBreak of shift.breaks) {
    if (!isWithin(shiftBreak, shiftPeriod)) {
      throw new RangeError('Une pause du planning de référence déborde de son shift.');
    }
  }
}
