import type {
  WeekAbsencesSnapshot,
  WeekAbsencesSnapshotReader,
} from '../lib/ports/week-absences-snapshot.reader';
import type { InMemoryAbsenceWeekReferenceRepository } from './in-memory-absence-week-reference.repository';
import type { InMemoryAbsenceRepository } from './in-memory-absence.repository';

/** Lecture en mémoire : sans écriture concurrente, deux lectures successives suffisent. */
export class InMemoryWeekAbsencesSnapshotReader implements WeekAbsencesSnapshotReader {
  constructor(
    private readonly absences: InMemoryAbsenceRepository,
    private readonly references: InMemoryAbsenceWeekReferenceRepository,
  ) {}

  async read(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
    from: Temporal.Instant,
    to: Temporal.Instant,
  ): Promise<WeekAbsencesSnapshot> {
    return {
      absences: await this.absences.listBySiteOverlapping(organizationId, siteId, from, to),
      references: await this.references.listBySite(organizationId, siteId, weekStartsOn),
    };
  }
}
