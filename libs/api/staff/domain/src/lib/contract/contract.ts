import {
  InvalidContractPeriodError,
  InvalidWeeklyVolumeError,
  OverlappingContractError,
} from './contract.errors';

/** Une semaine entière : 7 jours de 24 heures. Aucun volume hebdomadaire ne peut la dépasser. */
const MINUTES_PER_WEEK = 7 * 24 * 60;
const DAYS_PER_WEEK = 7;

export interface ContractProperties {
  id: string;
  organizationId: string;
  employeeId: string;
  weeklyMinutesMin: number;
  weeklyMinutesMax: number;
  startsOn: Temporal.PlainDate;
  endsOn: Temporal.PlainDate | undefined;
  createdAt: Temporal.Instant;
}

/**
 * Contrat de travail d'un employé : un volume hebdomadaire minimum et maximum, sur une période.
 * Le domaine conserve ce volume sans l'appliquer : vérifier qu'un planning le respecte est une
 * contrainte de planning, donc l'affaire du moteur seul (AGENTS.md, règle 5).
 */
export class Contract {
  readonly id: string;
  readonly organizationId: string;
  readonly employeeId: string;
  readonly weeklyMinutesMin: number;
  readonly weeklyMinutesMax: number;
  readonly startsOn: Temporal.PlainDate;
  /** Dernier jour du contrat, inclus. `undefined` : le contrat n'a pas de date de fin. */
  readonly endsOn: Temporal.PlainDate | undefined;
  readonly createdAt: Temporal.Instant;

  private constructor(properties: ContractProperties) {
    this.id = properties.id;
    this.organizationId = properties.organizationId;
    this.employeeId = properties.employeeId;
    this.weeklyMinutesMin = properties.weeklyMinutesMin;
    this.weeklyMinutesMax = properties.weeklyMinutesMax;
    this.startsOn = properties.startsOn;
    this.endsOn = properties.endsOn;
    this.createdAt = properties.createdAt;
  }

  static create(properties: ContractProperties): Contract {
    if (!isValidWeeklyVolume(properties.weeklyMinutesMin, properties.weeklyMinutesMax)) {
      throw new InvalidWeeklyVolumeError();
    }
    if (endsBeforeItStarts(properties.startsOn, properties.endsOn)) {
      throw new InvalidContractPeriodError();
    }
    return new Contract(properties);
  }

  /**
   * Vrai si le contrat couvre la semaine entière, du lundi au dimanche : c'est son minimum qui
   * vaut pour la semaine.
   */
  coversWeek(weekStartsOn: Temporal.PlainDate): boolean {
    const sunday = weekStartsOn.add({ days: DAYS_PER_WEEK - 1 });
    const startsInTime = Temporal.PlainDate.compare(this.startsOn, weekStartsOn) <= 0;
    if (this.endsOn === undefined) {
      return startsInTime;
    }
    return startsInTime && Temporal.PlainDate.compare(this.endsOn, sunday) >= 0;
  }

  /** Vrai si les deux contrats ont au moins un jour en commun. La date de fin est incluse. */
  overlaps(other: Contract): boolean {
    return startsNoLaterThanEndOf(this, other) && startsNoLaterThanEndOf(other, this);
  }
}

/** Un employé n'a qu'un contrat actif sur une même période (US-032). */
export function ensureNoOverlappingContract(
  contractsOfEmployee: readonly Contract[],
  candidate: Contract,
): void {
  const overlapsAnother = contractsOfEmployee.some((contract) => contract.overlaps(candidate));
  if (overlapsAnother) {
    throw new OverlappingContractError();
  }
}

function isValidWeeklyVolume(weeklyMinutesMin: number, weeklyMinutesMax: number): boolean {
  if (!Number.isInteger(weeklyMinutesMin) || !Number.isInteger(weeklyMinutesMax)) {
    return false;
  }
  if (weeklyMinutesMin < 0 || weeklyMinutesMin > weeklyMinutesMax) {
    return false;
  }
  return weeklyMinutesMax >= 1 && weeklyMinutesMax <= MINUTES_PER_WEEK;
}

function endsBeforeItStarts(
  startsOn: Temporal.PlainDate,
  endsOn: Temporal.PlainDate | undefined,
): boolean {
  if (endsOn === undefined) {
    return false;
  }
  return Temporal.PlainDate.compare(endsOn, startsOn) < 0;
}

/** Vrai si `contract` commence au plus tard le dernier jour de `other`. Sans fin, `other` dure toujours. */
function startsNoLaterThanEndOf(contract: Contract, other: Contract): boolean {
  if (other.endsOn === undefined) {
    return true;
  }
  return Temporal.PlainDate.compare(contract.startsOn, other.endsOn) <= 0;
}
