import type { Absence } from './absence';
import {
  type AbsenceValuation,
  type AbsenceWeekReference,
  type FrozenReferenceProperties,
  absentPeriodsOf,
} from './absence-week-reference';
import {
  InvalidDayValuationError,
  NoPartialAbsenceOnDayError,
  NotAnActivityDayError,
} from './absence.errors';
import { type InstantInterval, clippedTo, sameIntervals } from './instant-interval';

const DAYS_PER_WEEK = 7;
const MINUTES_PER_HOUR = 60;

/**
 * Durée donnée par le manager pour un jour couvert en partie. Elle ne vaut que pour la couverture
 * du jour à la saisie : si les absences de ce jour la changent, le jour revient « à définir ».
 * Des absences remaniées qui couvrent le jour de la même façon la gardent.
 */
export interface DayValuation {
  readonly valuedMinutes: number;
  /** Périodes d'absence du jour à la saisie, triées et sans recouvrement. */
  readonly coveredPeriods: readonly InstantInterval[];
}

type DayCoverage = 'NONE' | 'PART_OF_DAY' | 'WHOLE_DAY';

export interface EqualShareReferenceProperties extends FrozenReferenceProperties {
  /** Fuseau du site : il fixe où commence et finit chaque jour. */
  timeZone: string;
  weeklyMinimumMinutes: number;
  /** Jours où le site avait des besoins à la déclaration. */
  activityDays: readonly Temporal.PlainDate[];
  /** Durées données par le manager pour des jours couverts en partie, par date ISO. */
  dayValuations?: ReadonlyMap<string, DayValuation>;
}

/**
 * Convention de démonstration « parts égales sur les jours d'activité », réservée à l'absence de
 * planning de référence. Ce n'est ni une règle de paie ni un décompte légal : le minimum se
 * répartit à parts égales sur les jours où le site a des besoins. Un jour entier d'absence vaut
 * sa part ; un jour couvert en partie vaut la durée donnée par le manager, plafonnée à la part,
 * tant que ses absences le couvrent comme à la saisie. La répartition contractuelle viendra avec
 * les jours travaillables d'US-032.
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
  readonly dayValuations: ReadonlyMap<string, DayValuation>;

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

  /**
   * La même référence, avec la durée d'un jour qu'une absence couvre en partie. Une durée posée
   * sur un jour sans absence partielle valoriserait plus tard, en silence, une absence que
   * personne n'aurait regardée : elle est refusée.
   */
  withDayValuation(
    day: Temporal.PlainDate,
    valuedMinutes: number,
    absences: readonly Absence[],
  ): EqualShareReference {
    if (!this.isActivityDay(day)) {
      throw new NotAnActivityDayError();
    }
    const coveredPeriods = this.periodsAbsentOn(day, absentPeriodsOf(absences));
    if (this.coverageOf(day, coveredPeriods) !== 'PART_OF_DAY') {
      throw new NoPartialAbsenceOnDayError();
    }
    const isWholeMinutes = Number.isInteger(valuedMinutes) && valuedMinutes >= 0;
    if (!isWholeMinutes || valuedMinutes > this.dailyShareMinutes) {
      throw new InvalidDayValuationError(formatMinutes(Math.floor(this.dailyShareMinutes)));
    }
    const dayValuations = new Map(this.dayValuations);
    dayValuations.set(day.toString(), { valuedMinutes, coveredPeriods });
    return new EqualShareReference({ ...this, dayValuations });
  }

  value(absences: readonly Absence[]): AbsenceValuation {
    const absent = absentPeriodsOf(absences);
    let wholeDays = 0;
    let partialDaysMinutes = 0;
    const daysToDefine: Temporal.PlainDate[] = [];
    for (const day of this.activityDays) {
      const absentOnDay = this.periodsAbsentOn(day, absent);
      const coverage = this.coverageOf(day, absentOnDay);
      if (coverage === 'WHOLE_DAY') {
        wholeDays += 1;
        continue;
      }
      if (coverage === 'NONE') {
        continue;
      }
      const givenMinutes = this.givenMinutesFor(day, absentOnDay);
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
  private boundsOf(day: Temporal.PlainDate): InstantInterval {
    return {
      start: day.toZonedDateTime({ timeZone: this.timeZone }).toInstant(),
      end: day.add({ days: 1 }).toZonedDateTime({ timeZone: this.timeZone }).toInstant(),
    };
  }

  /** Périodes d'absence comprises dans le jour, triées et sans recouvrement. */
  private periodsAbsentOn(
    day: Temporal.PlainDate,
    absent: readonly InstantInterval[],
  ): InstantInterval[] {
    return clippedTo(absent, this.boundsOf(day));
  }

  private coverageOf(
    day: Temporal.PlainDate,
    absentOnDay: readonly InstantInterval[],
  ): DayCoverage {
    if (absentOnDay.length === 0) {
      return 'NONE';
    }
    if (sameIntervals(absentOnDay, [this.boundsOf(day)])) {
      return 'WHOLE_DAY';
    }
    return 'PART_OF_DAY';
  }

  /** Durée donnée pour le jour, tant que ses absences le couvrent comme à la saisie. */
  private givenMinutesFor(
    day: Temporal.PlainDate,
    absentOnDay: readonly InstantInterval[],
  ): number | undefined {
    const given = this.dayValuations.get(day.toString());
    if (given === undefined || !sameIntervals(given.coveredPeriods, absentOnDay)) {
      return undefined;
    }
    return given.valuedMinutes;
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
