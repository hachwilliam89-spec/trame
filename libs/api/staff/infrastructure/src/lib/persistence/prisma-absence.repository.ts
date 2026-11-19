import { Injectable } from '@nestjs/common';
import {
  type DatabaseClient,
  type Prisma,
  Database,
  dateToInstant,
  instantToDate,
} from '@trame/api/database';
import type { AbsenceRepository } from '@trame/api/staff/application';
import {
  Absence,
  type AbsenceReason,
  type AbsenceWeekReference,
  type ValuedDay,
} from '@trame/api/staff/domain';
import { toAbsenceWeekReferenceRecord } from './absence-week-reference-record';
import {
  discardValuationsOfDaysWithoutAbsence,
  lockWeeksOfValuedDays,
} from './day-valuation-statements';

/**
 * Absences dans `staff.absences`. Le site d'une absence est celui de son employé. Les références
 * qu'une absence fige s'écrivent dans la même transaction : une référence déjà présente pour le
 * salarié et la semaine, même écrite à l'instant par une autre requête, est gardée. Une
 * modification ou une suppression efface, dans sa transaction, la durée des jours qu'elle laisse
 * sans absence (`day-valuation-statements.ts`).
 */
@Injectable()
export class PrismaAbsenceRepository implements AbsenceRepository {
  constructor(private readonly database: Database) {}

  async add(absence: Absence, referencesToFreeze: readonly AbsenceWeekReference[]): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction.absence.create({ data: toAbsenceRecord(absence) });
      await freeze(transaction, referencesToFreeze);
    });
  }

  async findById(organizationId: string, absenceId: string): Promise<Absence | undefined> {
    const record = await this.database.client.absence.findFirst({
      where: { id: absenceId, organizationId },
    });
    return record === null ? undefined : toAbsence(record);
  }

  async update(
    absence: Absence,
    referencesToFreeze: readonly AbsenceWeekReference[],
    valuedDays: readonly ValuedDay[],
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      await lockWeeksOfValuedDays(
        transaction,
        absence.organizationId,
        absence.employeeId,
        valuedDays,
      );
      const { count } = await transaction.absence.updateMany({
        where: { id: absence.id, organizationId: absence.organizationId },
        data: {
          startsAt: instantToDate(absence.startsAt),
          endsAt: instantToDate(absence.endsAt),
          reason: absence.reason,
        },
      });
      if (count !== 1) {
        return false;
      }
      await freeze(transaction, referencesToFreeze);
      await discardValuationsOfDaysWithoutAbsence(
        transaction,
        absence.organizationId,
        absence.employeeId,
        valuedDays,
      );
      return true;
    });
  }

  async remove(absence: Absence, valuedDays: readonly ValuedDay[]): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      await lockWeeksOfValuedDays(
        transaction,
        absence.organizationId,
        absence.employeeId,
        valuedDays,
      );
      const { count } = await transaction.absence.deleteMany({
        where: { id: absence.id, organizationId: absence.organizationId },
      });
      if (count !== 1) {
        return false;
      }
      await discardValuationsOfDaysWithoutAbsence(
        transaction,
        absence.organizationId,
        absence.employeeId,
        valuedDays,
      );
      return true;
    });
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

  async listByEmployeeOverlapping(
    organizationId: string,
    employeeId: string,
    from: Temporal.Instant,
    to: Temporal.Instant,
  ): Promise<Absence[]> {
    const records = await this.database.client.absence.findMany({
      where: {
        organizationId,
        employeeId,
        startsAt: { lt: instantToDate(to) },
        endsAt: { gt: instantToDate(from) },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return records.map(toAbsence);
  }
}

function toAbsenceRecord(absence: Absence): Prisma.AbsenceUncheckedCreateInput {
  return {
    id: absence.id,
    organizationId: absence.organizationId,
    employeeId: absence.employeeId,
    startsAt: instantToDate(absence.startsAt),
    endsAt: instantToDate(absence.endsAt),
    reason: absence.reason,
    createdAt: instantToDate(absence.createdAt),
  };
}

/** `skipDuplicates` : la première référence figée pour le salarié et la semaine l'emporte. */
async function freeze(
  transaction: DatabaseClient,
  referencesToFreeze: readonly AbsenceWeekReference[],
): Promise<void> {
  if (referencesToFreeze.length === 0) {
    return;
  }
  await transaction.absenceWeekReference.createMany({
    data: referencesToFreeze.map(toAbsenceWeekReferenceRecord),
    skipDuplicates: true,
  });
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
