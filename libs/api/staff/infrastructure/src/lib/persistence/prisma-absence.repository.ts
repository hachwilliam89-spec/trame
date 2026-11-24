import { Injectable } from '@nestjs/common';
import { Database, instantToDate } from '@trame/api/database';
import type { AbsenceRepository } from '@trame/api/staff/application';
import type { Absence, AbsenceWeekReference } from '@trame/api/staff/domain';
import { toAbsence, toAbsenceRecord } from './absence-record';
import { freezeReferences } from './freeze-references';
import {
  discardValuationsOfDaysWithoutAbsence,
  lockValuedDaysOfWeeks,
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
      await freezeReferences(transaction, referencesToFreeze);
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
    weeksBefore: readonly Temporal.PlainDate[],
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const valuedDays = await lockValuedDaysOfWeeks(
        transaction,
        absence.organizationId,
        absence.employeeId,
        weeksBefore,
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
      await freezeReferences(transaction, referencesToFreeze);
      await discardValuationsOfDaysWithoutAbsence(
        transaction,
        absence.organizationId,
        absence.employeeId,
        valuedDays,
      );
      return true;
    });
  }

  async remove(absence: Absence, weeks: readonly Temporal.PlainDate[]): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const valuedDays = await lockValuedDaysOfWeeks(
        transaction,
        absence.organizationId,
        absence.employeeId,
        weeks,
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
