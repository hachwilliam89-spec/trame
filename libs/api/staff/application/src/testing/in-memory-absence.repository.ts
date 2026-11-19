import type { Absence } from '@trame/api/staff/domain';
import type { AbsenceRepository } from '../lib/ports/absence.repository';
import type { InMemoryEmployeeRepository } from './in-memory-employee.repository';

/** Dépôt en mémoire, pour les tests. Le site d'une absence est celui de son employé. */
export class InMemoryAbsenceRepository implements AbsenceRepository {
  private absences: Absence[] = [];

  constructor(private readonly employees: InMemoryEmployeeRepository) {}

  async add(absence: Absence): Promise<void> {
    this.absences.push(absence);
  }

  async findById(organizationId: string, absenceId: string): Promise<Absence | undefined> {
    return this.absences.find(
      (absence) => absence.organizationId === organizationId && absence.id === absenceId,
    );
  }

  async update(absence: Absence): Promise<boolean> {
    const index = this.absences.findIndex(
      (stored) => stored.organizationId === absence.organizationId && stored.id === absence.id,
    );
    if (index === -1) {
      return false;
    }
    this.absences[index] = absence;
    return true;
  }

  async remove(organizationId: string, absenceId: string): Promise<boolean> {
    const before = this.absences.length;
    this.absences = this.absences.filter(
      (absence) => absence.organizationId !== organizationId || absence.id !== absenceId,
    );
    return this.absences.length < before;
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
}

function byStartThenId(first: Absence, second: Absence): number {
  const byStart = Temporal.Instant.compare(first.startsAt, second.startsAt);
  if (byStart !== 0) {
    return byStart;
  }
  return first.id.localeCompare(second.id);
}
