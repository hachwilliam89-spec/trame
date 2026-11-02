import type { TimeZone } from '../site/time-zone';
import { isWholeMinute, wallClockMinutesBetween } from './local-time';
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
  /** `null` : créneau sans pause. */
  break: ShiftBreak | null;
  createdAt: Temporal.Instant;
}

/** Durées réelles d'un créneau commencé à une date donnée. */
export interface ShiftDurations {
  startsAt: Temporal.Instant;
  endsAt: Temporal.Instant;
  /** Temps réellement écoulé entre le début et la fin, changement d'heure compris. */
  amplitudeMinutes: number;
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
  readonly break: ShiftBreak | null;
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

  /** Crée un créneau type. L'unicité du libellé est vérifiée par le use case. */
  static create(properties: ShiftTemplateProperties): ShiftTemplate {
    if (properties.label.trim() === '') {
      throw new BlankShiftTemplateLabelError();
    }
    assertWholeMinutes(properties);

    const lengthMinutes = wallClockMinutesBetween(properties.start, properties.end);
    if (lengthMinutes === 0) {
      throw new EmptyShiftError();
    }
    if (
      properties.break !== null &&
      !breakFits(properties.break, properties.start, lengthMinutes)
    ) {
      throw new BreakOutsideShiftError();
    }
    return new ShiftTemplate(properties);
  }

  /** Reconstitue un créneau enregistré, sans revérifier des règles qui ont pu évoluer depuis. */
  static restore(properties: ShiftTemplateProperties): ShiftTemplate {
    return new ShiftTemplate(properties);
  }

  /** Vrai si le créneau finit le lendemain de son début (nuit 22 h–6 h). */
  get crossesMidnight(): boolean {
    return Temporal.PlainTime.compare(this.end, this.start) < 0;
  }

  /**
   * Durées du créneau qui commence le jour `date`, dans le fuseau du site.
   * La nuit du passage à l'heure d'hiver, 22 h–6 h dure 9 h ; celle du passage à l'heure d'été, 7 h.
   * Une heure locale qui n'existe pas (sautée au passage à l'heure d'été) est décalée d'une heure,
   * comme le fait Temporal par défaut.
   */
  durationsOn(date: Temporal.PlainDate, timeZone: TimeZone): ShiftDurations {
    const startsAt = date.toZonedDateTime({ timeZone: timeZone.id, plainTime: this.start });
    const endDate = this.crossesMidnight ? date.add({ days: 1 }) : date;
    const endsAt = endDate.toZonedDateTime({ timeZone: timeZone.id, plainTime: this.end });

    const amplitudeMinutes = startsAt.until(endsAt, { largestUnit: 'minutes' }).minutes;
    const breakMinutes = this.break?.durationMinutes ?? 0;
    // Un créneau logé dans l'heure sautée au passage à l'heure d'été dure 0 : la pause n'y retranche rien.
    const effectiveMinutes = Math.max(0, amplitudeMinutes - breakMinutes);

    return {
      startsAt: startsAt.toInstant(),
      endsAt: endsAt.toInstant(),
      amplitudeMinutes,
      effectiveMinutes,
    };
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
  const times = [properties.start, properties.end];
  if (properties.break !== null) {
    times.push(properties.break.start);
  }
  for (const time of times) {
    if (!isWholeMinute(time)) {
      throw new RangeError(`Heure de créneau à la minute attendue, reçu ${time.toString()}.`);
    }
  }
}
