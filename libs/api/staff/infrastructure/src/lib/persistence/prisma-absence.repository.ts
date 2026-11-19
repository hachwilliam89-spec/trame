import { Injectable } from '@nestjs/common';
import { type Prisma, Database, dateToInstant, instantToDate } from '@trame/api/database';
import type { AbsenceRepository } from '@trame/api/staff/application';
import { Absence, type AbsenceReason } from '@trame/api/staff/domain';

/** Absences dans `staff.absences`. Le site d'une absence est celui de son employé. */
@Injectable()
export class PrismaAbsenceRepository implements AbsenceRepository {
  constructor(private readonly database: Database) {}

  async add(absence: Absence): Promise<void> {
    await this.database.client.absence.create({
      data: {
        id: absence.id,
        organizationId: absence.organizationId,
        employeeId: absence.employeeId,
        startsAt: instantToDate(absence.startsAt),
        endsAt: instantToDate(absence.endsAt),
        reason: absence.reason,
        createdAt: instantToDate(absence.createdAt),
      },
    });
  }

  async findById(organizationId: string, absenceId: string): Promise<Absence | undefined> {
    const record = await this.database.client.absence.findFirst({
      where: { id: absenceId, organizationId },
    });
    return record === null ? undefined : toAbsence(record);
  }

  async update(absence: Absence): Promise<boolean> {
    const { count } = await this.database.client.absence.updateMany({
      where: { id: absence.id, organizationId: absence.organizationId },
      data: {
        startsAt: instantToDate(absence.startsAt),
        endsAt: instantToDate(absence.endsAt),
        reason: absence.reason,
      },
    });
    return count === 1;
  }

  async remove(organizationId: string, absenceId: string): Promise<boolean> {
    const { count } = await this.database.client.absence.deleteMany({
      where: { id: absenceId, organizationId },
    });
    return count === 1;
  }

  async listBySiteOverlapping(
    organizationId: string,
    siteId: string,
    from: Temporal.Instant,
    to: Temporal.Instant,
  ): Promise<Absence[]> {
    const records = await this.database.client.absence.findMany({
      where: {
        organizationId,
        employee: { siteId },
        startsAt: { lt: instantToDate(to) },
        endsAt: { gt: instantToDate(from) },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return records.map(toAbsence);
  }
}

function toAbsence(record: Prisma.AbsenceModel): Absence {
  return Absence.create({
    id: record.id,
    organizationId: record.organizationId,
    employeeId: record.employeeId,
    startsAt: dateToInstant(record.startsAt),
    endsAt: dateToInstant(record.endsAt),
    // La base n'accepte que les quatre catégories, et le domaine les vérifie à nouveau.
    reason: record.reason as AbsenceReason,
    createdAt: dateToInstant(record.createdAt),
  });
}
