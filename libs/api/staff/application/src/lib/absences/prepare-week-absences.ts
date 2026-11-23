import {
  type Absence,
  type InstantInterval,
  type WeekBounds,
  weekBounds,
} from '@trame/api/staff/domain';
import { SiteNotFoundError } from '../not-found.errors';
import type {
  WeekAbsencesSnapshot,
  WeekAbsencesSnapshotReader,
} from '../ports/week-absences-snapshot.reader';
import type { OrganizationCatalog } from '../ports/organization-catalog';
import type { PendingWeekReferences } from './pending-week-references';
import {
  type EmployeeAbsenceValuation,
  groupByEmployee,
  valuationsOf,
} from './week-absence-valuations';

export interface PrepareWeekAbsencesCommand {
  organizationId: string;
  siteId: string;
  /** Lundi de la semaine. */
  weekStartsOn: Temporal.PlainDate;
  /**
   * Période dont la génération veut aussi les absences : celle de ses créneaux, qui peut
   * déborder de la semaine (un créneau du dimanche qui finit le lundi matin).
   */
  absencesWithin?: InstantInterval;
}

export interface WeekAbsences {
  /** Absences qui touchent la semaine ou `absencesWithin`, triées par début puis identifiant. */
  readonly absences: readonly Absence[];
  /** Valorisation de chaque employé absent dans la semaine, triée par employé. */
  readonly valuations: readonly EmployeeAbsenceValuation[];
}

/**
 * Les absences d'une semaine telles qu'une génération les utilise (US-033). Le gel des références
 * « à définir » est d'abord retenté, puis absences et valorisations sont lues dans un même état :
 * l'indisponibilité et le minimum restant viennent de la même version de chaque absence.
 */
export class PrepareWeekAbsences {
  constructor(
    private readonly catalog: OrganizationCatalog,
    private readonly snapshots: WeekAbsencesSnapshotReader,
    private readonly pending: PendingWeekReferences,
  ) {}

  async execute(command: PrepareWeekAbsencesCommand): Promise<WeekAbsences> {
    const timeZone = await this.catalog.timeZoneOfSite(command.organizationId, command.siteId);
    if (timeZone === undefined) {
      throw new SiteNotFoundError();
    }
    const week = weekBounds(command.weekStartsOn, timeZone);
    const window = widestOf({ start: week.from, end: week.to }, command.absencesWithin);
    const first = await this.readSnapshot(command, window);
    const isFrozen = await this.pending.freeze(
      command.organizationId,
      command.weekStartsOn,
      groupByEmployee(withoutReference(absencesWithin(first.absences, week), first)),
    );
    const snapshot = isFrozen ? await this.readSnapshot(command, window) : first;
    return {
      absences: snapshot.absences,
      valuations: valuationsOf(absencesWithin(snapshot.absences, week), snapshot.references),
    };
  }

  private readSnapshot(
    command: PrepareWeekAbsencesCommand,
    window: InstantInterval,
  ): Promise<WeekAbsencesSnapshot> {
    return this.snapshots.read(
      command.organizationId,
      command.siteId,
      command.weekStartsOn,
      window.start,
      window.end,
    );
  }
}

/** La plus petite période qui contient la semaine et la période demandée. */
function widestOf(week: InstantInterval, requested: InstantInterval | undefined): InstantInterval {
  if (requested === undefined) {
    return week;
  }
  const starts = [requested.start, week.start].sort(Temporal.Instant.compare);
  const ends = [requested.end, week.end].sort(Temporal.Instant.compare);
  return { start: starts[0] ?? week.start, end: ends[1] ?? week.end };
}

function absencesWithin(absences: readonly Absence[], week: WeekBounds): Absence[] {
  return absences.filter((absence) => absence.overlaps(week.from, week.to));
}

/** Absences des employés qui n'ont pas encore de référence pour la semaine. */
function withoutReference(absences: readonly Absence[], snapshot: WeekAbsencesSnapshot): Absence[] {
  return absences.filter(
    (absence) =>
      !snapshot.references.some((reference) => reference.employeeId === absence.employeeId),
  );
}
