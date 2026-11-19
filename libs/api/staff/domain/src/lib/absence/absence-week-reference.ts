import type { Absence } from './absence';
import { InvalidDayValuationError, NotAnActivityDayError } from './absence.errors';
import {
  type InstantInterval,
  isWithin,
  minutesBetween,
  minutesCoveredBy,
  unionOf,
} from './instant-interval';

const DAYS_PER_WEEK = 7;
const MINUTES_PER_HOUR = 60;

/**
 * Minutes d'absence d'un salarié sur une semaine, ou les jours dont la durée reste à donner.
 * Le minimum contractuel restant en découle : max(0, minimum − absenceMinutes) (US-033).
 */
export type AbsenceValuation =
  | { readonly status: 'VALUED'; readonly absenceMinutes: number }
  | { readonly status: 'TO_DEFINE'; readonly daysToDefine: readonly Temporal.PlainDate[] };

export type ValuationMethod = 'REFERENCE_PLANNING' | 'EQUAL_SHARE_OF_ACTIVITY_DAYS';

/**
 * Référence figée qui valorise les absences d'un salarié sur une semaine (US-033). Elle est figée
 * à sa première absence de la semaine et ne change plus : aucune génération ultérieure ne peut
 * déplacer les heures qui servent au calcul. Deux stratégies : le planning de référence, ou, sans
 * planning, la convention de démonstration des parts égales.
 */
export interface AbsenceWeekReference {
  readonly method: ValuationMethod;
  readonly organizationId: string;
  readonly employeeId: string;
  /** Lundi de la semaine. */
  readonly weekStartsOn: Temporal.PlainDate;
  readonly frozenAt: Temporal.Instant;
  /** Valorise les absences actives du salarié qui touchent la semaine. */
  value(absences: readonly Absence[]): AbsenceValuation;
}

interface FrozenReferenceProperties {
  organizationId: string;
  employeeId: string;
  weekStartsOn: Temporal.PlainDate;
  frozenAt: Temporal.Instant;
}

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
    const absent = unionOf(absences.map(periodOf));
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

export interface EqualShareReferenceProperties extends FrozenReferenceProperties {
  /** Fuseau du site : il fixe où commence et finit chaque jour. */
  timeZone: string;
  weeklyMinimumMinutes: number;
  /** Jours où le site avait des besoins à la déclaration. */
  activityDays: readonly Temporal.PlainDate[];
  /** Durées données par le manager pour des jours couverts en partie, par date ISO. */
  dayValuations?: ReadonlyMap<string, number>;
}

/**
 * Convention de démonstration « parts égales sur les jours d'activité », réservée à l'absence de
 * planning de référence. Ce n'est ni une règle de paie ni un décompte légal : le minimum se
 * répartit à parts égales sur les jours où le site a des besoins. Un jour entier d'absence vaut
 * sa part ; un jour couvert en partie vaut la durée donnée par le manager, plafonnée à la part.
 * La répartition contractuelle viendra avec les jours travaillables d'US-032.
 */
export class EqualShareReference implements AbsenceWeekReference {
  readonly method = 'EQUAL_SHARE_OF_ACTIVITY_DAYS';
  readonly organizationId: string;
  readonly employeeId: string;
  readonly weekStartsOn: Temporal.PlainDate;
  readonly frozenAt: Temporal.Instant;
  readonly timeZone: string;
  readonly weeklyMinimumMinutes: number;
  readonly activityDays: readonly Temporal.PlainDate[];
  readonly dayValuations: ReadonlyMap<string, number>;

  private constructor(properties: EqualShareReferenceProperties) {
    this.organizationId = properties.organizationId;
    this.employeeId = properties.employeeId;
    this.weekStartsOn = properties.weekStartsOn;
    this.frozenAt = properties.frozenAt;
    this.timeZone = properties.timeZone;
    this.weeklyMinimumMinutes = properties.weeklyMinimumMinutes;
    this.activityDays = properties.activityDays;
    this.dayValuations = properties.dayValuations ?? new Map();
  }

  static freeze(properties: EqualShareReferenceProperties): EqualShareReference {
    if (properties.activityDays.length === 0) {
      throw new RangeError('La convention de parts égales demande au moins un jour d’activité.');
    }
    for (const day of properties.activityDays) {
      if (!isInWeek(day, properties.weekStartsOn)) {
        throw new RangeError(`Jour d'activité hors de la semaine : ${day.toString()}.`);
      }
    }
    return new EqualShareReference(properties);
  }

  /** Minimum divisé par le nombre de jours d'activité, éventuellement non entier. */
  get dailyShareMinutes(): number {
    return this.weeklyMinimumMinutes / this.activityDays.length;
  }

  /** La même référence, avec la durée valorisée d'un jour couvert en partie. */
  withDayValuation(day: Temporal.PlainDate, minutes: number): EqualShareReference {
    if (!this.isActivityDay(day)) {
      throw new NotAnActivityDayError();
    }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > this.dailyShareMinutes) {
      throw new InvalidDayValuationError(formatMinutes(Math.floor(this.dailyShareMinutes)));
    }
    const dayValuations = new Map(this.dayValuations);
    dayValuations.set(day.toString(), minutes);
    return new EqualShareReference({ ...this, dayValuations });
  }

  value(absences: readonly Absence[]): AbsenceValuation {
    const absent = unionOf(absences.map(periodOf));
    let wholeDays = 0;
    let partialDaysMinutes = 0;
    const daysToDefine: Temporal.PlainDate[] = [];
    for (const day of this.activityDays) {
      const coverage = this.coverageOf(day, absent);
      if (coverage === 'WHOLE_DAY') {
        wholeDays += 1;
        continue;
      }
      if (coverage === 'NONE') {
        continue;
      }
      const givenMinutes = this.dayValuations.get(day.toString());
      if (givenMinutes === undefined) {
        daysToDefine.push(day);
        continue;
      }
      partialDaysMinutes += givenMinutes;
    }
    if (daysToDefine.length > 0) {
      return { status: 'TO_DEFINE', daysToDefine };
    }
    // Les jours entiers sont arrondis ensemble : une semaine entière vaut exactement le minimum.
    const wholeDaysMinutes = Math.round(
      (this.weeklyMinimumMinutes * wholeDays) / this.activityDays.length,
    );
    const absenceMinutes = Math.min(
      this.weeklyMinimumMinutes,
      wholeDaysMinutes + partialDaysMinutes,
    );
    return { status: 'VALUED', absenceMinutes };
  }

  private isActivityDay(day: Temporal.PlainDate): boolean {
    return this.activityDays.some((activityDay) => activityDay.equals(day));
  }

  /** Le jour, de minuit à minuit à l'heure du site : 23 h ou 25 h un jour de changement d'heure. */
  private coverageOf(
    day: Temporal.PlainDate,
    absent: readonly InstantInterval[],
  ): 'NONE' | 'PART_OF_DAY' | 'WHOLE_DAY' {
    const wholeDay: InstantInterval = {
      start: day.toZonedDateTime({ timeZone: this.timeZone }).toInstant(),
      end: day.add({ days: 1 }).toZonedDateTime({ timeZone: this.timeZone }).toInstant(),
    };
    const covered = minutesCoveredBy(absent, wholeDay);
    if (covered === 0) {
      return 'NONE';
    }
    if (covered === minutesBetween(wholeDay.start, wholeDay.end)) {
      return 'WHOLE_DAY';
    }
    return 'PART_OF_DAY';
  }
}

/**
 * Valorise les absences d'un salarié sur une semaine. Sans référence figée, une absence reste
 * « à définir » : elle n'est jamais comptée pour zéro en silence.
 */
export function valueAbsencesOfWeek(
  reference: AbsenceWeekReference | undefined,
  absences: readonly Absence[],
): AbsenceValuation {
  if (reference !== undefined) {
    return reference.value(absences);
  }
  if (absences.length === 0) {
    return { status: 'VALUED', absenceMinutes: 0 };
  }
  return { status: 'TO_DEFINE', daysToDefine: [] };
}

function periodOf(absence: Absence): InstantInterval {
  return { start: absence.startsAt, end: absence.endsAt };
}

function ensureBreaksWithinShift(shift: WorkedShift): void {
  const shiftPeriod: InstantInterval = { start: shift.startsAt, end: shift.endsAt };
  for (const shiftBreak of shift.breaks) {
    if (!isWithin(shiftBreak, shiftPeriod)) {
      throw new RangeError('Une pause du planning de référence déborde de son shift.');
    }
  }
}

function isInWeek(day: Temporal.PlainDate, weekStartsOn: Temporal.PlainDate): boolean {
  const offset = weekStartsOn.until(day, { largestUnit: 'days' }).days;
  return offset >= 0 && offset < DAYS_PER_WEEK;
}

/** `280` → `4 h 40`, comme l'écran l'affiche. */
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const remainder = String(minutes % MINUTES_PER_HOUR).padStart(2, '0');
  return `${hours} h ${remainder}`;
}
