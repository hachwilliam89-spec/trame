import {
  type Absence,
  type AbsenceWeekReference,
  EqualShareReference,
} from '@trame/api/staff/domain';
import type { AbsenceRepository } from '../lib/ports/absence.repository';
import type { InMemoryAbsenceWeekReferenceRepository } from './in-memory-absence-week-reference.repository';
import type { InMemoryEmployeeRepository } from './in-memory-employee.repository';

/** Dépôt en mémoire, pour les tests. Le site d'une absence est celui de son employé. */
export class InMemoryAbsenceRepository implements AbsenceRepository {
  private absences: Absence[] = [];

  constructor(
    private readonly employees: InMemoryEmployeeRepository,
    private readonly references: InMemoryAbsenceWeekReferenceRepository,
  ) {}

  async add(absence: Absence, referencesToFreeze: readonly AbsenceWeekReference[]): Promise<void> {
    this.absences.push(absence);
    this.freeze(referencesToFreeze);
  }

  async findById(organizationId: string, absenceId: string): Promise<Absence | undefined> {
    return this.absences.find(
      (absence) => absence.organizationId === organizationId && absence.id === absenceId,
    );
  }

  async update(
    absence: Absence,
    referencesToFreeze: readonly AbsenceWeekReference[],
    weeksBefore: readonly Temporal.PlainDate[],
  ): Promise<boolean> {
    const index = this.absences.findIndex(
      (stored) => stored.organizationId === absence.organizationId && stored.id === absence.id,
    );
    if (index === -1) {
      return false;
    }
    this.absences[index] = absence;
    this.freeze(referencesToFreeze);
    await this.discardValuationsOfDaysWithoutAbsence(absence, weeksBefore);
    return true;
  }

  async remove(absence: Absence, weeks: readonly Temporal.PlainDate[]): Promise<boolean> {
    const before = this.absences.length;
    this.absences = this.absences.filter(
      (stored) => stored.organizationId !== absence.organizationId || stored.id !== absence.id,
    );
    if (this.absences.length === before) {
      return false;
    }
    await this.discardValuationsOfDaysWithoutAbsence(absence, weeks);
    return true;
  }

  async listBySiteOverlapping(
    organizationId: string,
    siteId: string,
    from: Temporal.Instant,
    to: Temporal.Instant,
  ): Promise<Absence[]> {
    const matching: Absence[] = [];
    for (const absence of this.absences) {
      if (absence.organizationId !== organizationId || !absence.overlaps(from, to)) {
        continue;
      }
      const employee = await this.employees.findById(organizationId, absence.employeeId);
      if (employee?.siteId === siteId) {
        matching.push(absence);
      }
    }
    return matching.sort(byStartThenId);
  }

  async listByEmployeeOverlapping(
    organizationId: string,
    employeeId: string,
    from: Temporal.Instant,
    to: Temporal.Instant,
  ): Promise<Absence[]> {
    const matching = this.absences.filter(
      (absence) =>
        absence.organizationId === organizationId &&
        absence.employeeId === employeeId &&
        absence.overlaps(from, to),
    );
    return matching.sort(byStartThenId);
  }

  private freeze(referencesToFreeze: readonly AbsenceWeekReference[]): void {
    for (const reference of referencesToFreeze) {
      this.references.addIfAbsent(reference);
    }
  }

  /** Comme la base : la durée d'un jour qu'aucune absence de l'employé ne touche plus disparaît. */
  private async discardValuationsOfDaysWithoutAbsence(
    written: Absence,
    weeks: readonly Temporal.PlainDate[],
  ): Promise<void> {
    for (const weekStartsOn of weeks) {
      const reference = await this.references.find(
        written.organizationId,
        written.employeeId,
        weekStartsOn,
      );
      if (reference instanceof EqualShareReference) {
        this.discardValuationsOfWeek(written, reference);
      }
    }
  }

  private discardValuationsOfWeek(written: Absence, reference: EqualShareReference): void {
    for (const valuedDay of reference.valuedDays()) {
      const isStillAbsent = this.absences.some(
        (absence) =>
          absence.organizationId === written.organizationId &&
          absence.employeeId === written.employeeId &&
          absence.overlaps(valuedDay.bounds.start, valuedDay.bounds.end),
      );
      if (!isStillAbsent) {
        this.references.discardDayValuation(written.organizationId, written.employeeId, valuedDay);
      }
    }
  }
}

function byStartThenId(first: Absence, second: Absence): number {
  const byStart = Temporal.Instant.compare(first.startsAt, second.startsAt);
  if (byStart !== 0) {
    return byStart;
  }
  return first.id.localeCompare(second.id);
}
