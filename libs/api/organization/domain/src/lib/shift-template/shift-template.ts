import type { TimeZone } from '../site/time-zone';
import { type InstantInterval, minutesBetween, overlapMinutes } from './instant-interval';
import { instantOfLocalTime, isWholeMinute, wallClockMinutesBetween } from './local-time';
import type { ShiftBreak } from './shift-break';
import {
  BlankShiftTemplateLabelError,
  BreakOutsideShiftError,
  EmptyShiftError,
} from './shift-template.errors';

export interface ShiftTemplateProperties {
  id: string;
  organizationId: string;
  siteId: string;
  label: string;
  /** Heures locales du site. Une fin plus tôt que le début signifie le lendemain. */
  start: Temporal.PlainTime;
  end: Temporal.PlainTime;
  /** Règle métier (US-030) : un créneau type a toujours une pause positionnée. */
  break: ShiftBreak;
  createdAt: Temporal.Instant;
}

/** Durées réelles d'un créneau commencé à une date donnée. */
export interface ShiftDurations {
  startsAt: Temporal.Instant;
  endsAt: Temporal.Instant;
  /** Temps réellement écoulé entre le début et la fin, changement d'heure compris. */
  amplitudeMinutes: number;
  /** Partie de la pause qui tombe pendant le créneau. */
  breakMinutes: number;
  /** Amplitude moins la pause. */
  effectiveMinutes: number;
}

/** Créneau type d'un site (« Nuit », 22 h–6 h, pause de 30 min à 2 h), défini en heure locale. */
export class ShiftTemplate {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly label: string;
  readonly start: Temporal.PlainTime;
  readonly end: Temporal.PlainTime;
  readonly break: ShiftBreak;
  readonly createdAt: Temporal.Instant;

  private constructor(properties: ShiftTemplateProperties) {
    this.id = properties.id;
    this.organizationId = properties.organizationId;
    this.siteId = properties.siteId;
    this.label = properties.label;
    this.start = properties.start;
    this.end = properties.end;
    this.break = properties.break;
    this.createdAt = properties.createdAt;
  }

  /** Construit un créneau type valide, nouveau ou relu en base. */
  static create(properties: ShiftTemplateProperties): ShiftTemplate {
    if (properties.label.trim() === '') {
      throw new BlankShiftTemplateLabelError();
    }
    assertWholeMinutes(properties);

    const lengthMinutes = wallClockMinutesBetween(properties.start, properties.end);
    if (lengthMinutes === 0) {
      throw new EmptyShiftError();
    }
    if (!breakFits(properties.break, properties.start, lengthMinutes)) {
      throw new BreakOutsideShiftError();
    }
    return new ShiftTemplate(properties);
  }

  /** Vrai si le créneau finit le lendemain de son début (nuit 22 h–6 h). */
  get crossesMidnight(): boolean {
    return Temporal.PlainTime.compare(this.end, this.start) < 0;
  }

  /**
   * Durées du créneau qui commence le jour `date`, dans le fuseau du site.
   * - Chaque heure locale désigne le premier instant où l'horloge l'affiche, ou l'instant du saut
   *   si elle est sautée (`instantOfLocalTime`). La fin ne précède donc jamais le début.
   * - La pause dure son nombre de minutes en temps réel, à partir de son heure de début. Seule sa
   *   partie comprise dans le créneau est retranchée.
   * La nuit 22 h–6 h dure ainsi 9 h au passage à l'heure d'hiver, et 7 h au passage à l'heure d'été.
   */
  durationsOn(date: Temporal.PlainDate, timeZone: TimeZone): ShiftDurations {
    const shift: InstantInterval = {
      start: this.instantOn(date, this.start, timeZone),
      end: this.instantOn(date, this.end, timeZone),
    };
    const breakStart = this.instantOn(date, this.break.start, timeZone);
    const shiftBreak: InstantInterval = {
      start: breakStart,
      end: breakStart.add({ minutes: this.break.durationMinutes }),
    };

    const amplitudeMinutes = minutesBetween(shift.start, shift.end);
    const breakMinutes = overlapMinutes(shiftBreak, shift);

    return {
      startsAt: shift.start,
      endsAt: shift.end,
      amplitudeMinutes,
      breakMinutes,
      effectiveMinutes: amplitudeMinutes - breakMinutes,
    };
  }

  /**
   * Instant d'une heure du créneau qui commence le jour `startDate`. Une heure plus tôt que le
   * début tombe le lendemain : la fin d'une nuit, ou une pause après minuit.
   */
  private instantOn(
    startDate: Temporal.PlainDate,
    time: Temporal.PlainTime,
    timeZone: TimeZone,
  ): Temporal.Instant {
    let date = startDate;
    if (Temporal.PlainTime.compare(time, this.start) < 0) {
      date = startDate.add({ days: 1 });
    }
    return instantOfLocalTime(date.toPlainDateTime(time), timeZone.id);
  }
}

/** Vrai si la pause commence et finit pendant le créneau, en heure d'horloge murale. */
function breakFits(
  shiftBreak: ShiftBreak,
  shiftStart: Temporal.PlainTime,
  shiftLengthMinutes: number,
): boolean {
  const breakOffsetMinutes = wallClockMinutesBetween(shiftStart, shiftBreak.start);
  const breakEndOffsetMinutes = breakOffsetMinutes + shiftBreak.durationMinutes;
  return breakEndOffsetMinutes <= shiftLengthMinutes;
}

/**
 * Les heures sont enregistrées à la minute. Des secondes viendraient d'une erreur de programmation
 * (le contrat n'en accepte pas) : on refuse plutôt que de les perdre en silence.
 */
function assertWholeMinutes(properties: ShiftTemplateProperties): void {
  const times = [properties.start, properties.end, properties.break.start];
  for (const time of times) {
    if (!isWholeMinute(time)) {
      throw new RangeError(`Heure de créneau à la minute attendue, reçu ${time.toString()}.`);
    }
  }
}
