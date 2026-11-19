import { Injectable } from '@nestjs/common';
import { Database, plainDateToDate } from '@trame/api/database';
import type { AbsenceWeekReferenceRepository } from '@trame/api/staff/application';
import type { AbsenceWeekReference, EqualShareReference } from '@trame/api/staff/domain';
import { dayValuationsOf, toAbsenceWeekReference } from './absence-week-reference-record';

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

  async saveDayValuations(reference: EqualShareReference): Promise<boolean> {
    const { count } = await this.database.client.absenceWeekReference.updateMany({
      where: {
        organizationId: reference.organizationId,
        employeeId: reference.employeeId,
        weekStartsOn: plainDateToDate(reference.weekStartsOn),
        method: reference.method,
      },
      data: { dayValuations: dayValuationsOf(reference) },
    });
    return count === 1;
  }
}
