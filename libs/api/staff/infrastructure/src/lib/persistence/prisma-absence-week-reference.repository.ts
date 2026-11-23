import { Injectable } from '@nestjs/common';
import { Database, plainDateToDate } from '@trame/api/database';
import type {
  AbsenceWeekReferenceRepository,
  DayValuationSaveOutcome,
} from '@trame/api/staff/application';
import type { AbsenceWeekReference, EqualShareReference } from '@trame/api/staff/domain';
import { toAbsenceWeekReference } from './absence-week-reference-record';
import { lockEqualShareReference, setValuationOfDayWithAbsence } from './day-valuation-statements';

/** Références de valorisation dans `staff.absence_week_references`. */
@Injectable()
export class PrismaAbsenceWeekReferenceRepository implements AbsenceWeekReferenceRepository {
  constructor(private readonly database: Database) {}

  async find(
    organizationId: string,
    employeeId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<AbsenceWeekReference | undefined> {
    const record = await this.database.client.absenceWeekReference.findUnique({
      where: {
        organizationId_employeeId_weekStartsOn: {
          organizationId,
          employeeId,
          weekStartsOn: plainDateToDate(weekStartsOn),
        },
      },
    });
    return record === null ? undefined : toAbsenceWeekReference(record);
  }

  async listBySite(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<AbsenceWeekReference[]> {
    const records = await this.database.client.absenceWeekReference.findMany({
      where: { organizationId, weekStartsOn: plainDateToDate(weekStartsOn), employee: { siteId } },
      orderBy: { employeeId: 'asc' },
    });
    return records.map(toAbsenceWeekReference);
  }

  async saveDayValuation(
    reference: EqualShareReference,
    day: Temporal.PlainDate,
  ): Promise<DayValuationSaveOutcome> {
    const valuation = reference.dayValuations.get(day.toString());
    if (valuation === undefined) {
      throw new RangeError(`La référence ne donne aucune durée au ${day.toString()}.`);
    }
    return this.database.transaction(async (transaction) => {
      const isLocked = await lockEqualShareReference(
        transaction,
        reference.organizationId,
        reference.employeeId,
        reference.weekStartsOn,
      );
      if (!isLocked) {
        return 'REFERENCE_NOT_FOUND';
      }
      const isSaved = await setValuationOfDayWithAbsence(transaction, reference, day, valuation);
      if (!isSaved) {
        return 'DAY_WITHOUT_ABSENCE';
      }
      return 'SAVED';
    });
  }
}
