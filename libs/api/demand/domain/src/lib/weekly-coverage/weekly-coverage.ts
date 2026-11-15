import type { CoverageNeed } from './coverage-need';
import {
  DuplicateCoverageNeedError,
  InvalidRequiredCountError,
  InvalidWeekStartError,
  NeedOutsideWeekError,
} from './weekly-coverage.errors';

/** Lundi dans la numérotation ISO 8601 des jours de la semaine. */
const MONDAY = 1;

/** Du lundi au dimanche : le dernier jour de la semaine est six jours après le premier. */
const LAST_DAY_OFFSET = 6;

const REQUIRED_COUNT_MAX = 999;

export interface WeeklyCoverageProperties {
  organizationId: string;
  siteId: string;
  weekStartsOn: Temporal.PlainDate;
  needs: readonly CoverageNeed[];
  updatedAt: Temporal.Instant;
}

/**
 * Besoins de couverture d'un site pour une semaine, du lundi au dimanche. Une semaine n'a qu'un
 * besoin par jour, créneau type et poste ; un besoin nul s'exprime par son absence.
 */
export class WeeklyCoverage {
  readonly organizationId: string;
  readonly siteId: string;
  /** Lundi de la semaine, dans le calendrier du site. */
  readonly weekStartsOn: Temporal.PlainDate;
  readonly needs: readonly CoverageNeed[];
  /** Instant de la dernière définition de ces besoins. */
  readonly updatedAt: Temporal.Instant;

  private constructor(properties: WeeklyCoverageProperties) {
    this.organizationId = properties.organizationId;
    this.siteId = properties.siteId;
    this.weekStartsOn = properties.weekStartsOn;
    this.needs = Object.freeze([...properties.needs]);
    this.updatedAt = properties.updatedAt;
  }

  static create(properties: WeeklyCoverageProperties): WeeklyCoverage {
    ensureWeekStartsOnMonday(properties.weekStartsOn);
    const needs = properties.needs.map(withLowercaseIdentifiers);
    for (const need of needs) {
      ensureNeedIsValid(need, properties.weekStartsOn);
    }
    ensureNoDuplicateNeed(needs);
    return new WeeklyCoverage({ ...properties, needs: needs.toSorted(compareNeeds) });
  }
}

/** Lève `InvalidWeekStartError` si le jour donné n'est pas un lundi. */
export function ensureWeekStartsOnMonday(weekStartsOn: Temporal.PlainDate): void {
  if (weekStartsOn.dayOfWeek !== MONDAY) {
    throw new InvalidWeekStartError();
  }
}

/** PostgreSQL compare les UUID sans tenir compte de la casse. Le domaine fait de même. */
function withLowercaseIdentifiers(need: CoverageNeed): CoverageNeed {
  return {
    date: need.date,
    shiftTemplateId: need.shiftTemplateId.toLowerCase(),
    positionId: need.positionId.toLowerCase(),
    requiredCount: need.requiredCount,
  };
}

function ensureNeedIsValid(need: CoverageNeed, weekStartsOn: Temporal.PlainDate): void {
  const lastDay = weekStartsOn.add({ days: LAST_DAY_OFFSET });
  const isBeforeWeek = Temporal.PlainDate.compare(need.date, weekStartsOn) < 0;
  const isAfterWeek = Temporal.PlainDate.compare(need.date, lastDay) > 0;
  if (isBeforeWeek || isAfterWeek) {
    throw new NeedOutsideWeekError();
  }
  if (!isValidRequiredCount(need.requiredCount)) {
    throw new InvalidRequiredCountError();
  }
}

function isValidRequiredCount(requiredCount: number): boolean {
  return (
    Number.isInteger(requiredCount) && requiredCount >= 1 && requiredCount <= REQUIRED_COUNT_MAX
  );
}

function ensureNoDuplicateNeed(needs: readonly CoverageNeed[]): void {
  const distinctSlots = new Set(needs.map(slotOf));
  if (distinctSlots.size !== needs.length) {
    throw new DuplicateCoverageNeedError();
  }
}

/** Ce qui identifie un besoin dans sa semaine : le jour, le créneau type et le poste. */
function slotOf(need: CoverageNeed): string {
  return `${need.date.toString()}/${need.shiftTemplateId}/${need.positionId}`;
}

/** Ordre stable des besoins : par jour, puis par créneau type, puis par poste. */
function compareNeeds(left: CoverageNeed, right: CoverageNeed): number {
  const byDate = Temporal.PlainDate.compare(left.date, right.date);
  if (byDate !== 0) {
    return byDate;
  }
  const byShiftTemplate = compareText(left.shiftTemplateId, right.shiftTemplateId);
  if (byShiftTemplate !== 0) {
    return byShiftTemplate;
  }
  return compareText(left.positionId, right.positionId);
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
