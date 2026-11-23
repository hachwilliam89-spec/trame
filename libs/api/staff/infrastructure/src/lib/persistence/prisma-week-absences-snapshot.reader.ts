import { Injectable } from '@nestjs/common';
import { PrismaService, instantToDate, plainDateToDate } from '@trame/api/database';
import type {
  WeekAbsencesSnapshot,
  WeekAbsencesSnapshotReader,
} from '@trame/api/staff/application';
import { toAbsence } from './absence-record';
import { toAbsenceWeekReference } from './absence-week-reference-record';

/**
 * Lit absences et références dans une seule transaction en lecture répétable : les deux lectures
 * voient le même état de la base, même si une absence change entre elles.
 */
@Injectable()
export class PrismaWeekAbsencesSnapshotReader implements WeekAbsencesSnapshotReader {
  constructor(private readonly prisma: PrismaService) {}

  read(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
    from: Temporal.Instant,
    to: Temporal.Instant,
  ): Promise<WeekAbsencesSnapshot> {
    return this.prisma.$transaction(
      async (transaction) => {
        const absences = await transaction.absence.findMany({
          where: {
            organizationId,
            employee: { siteId },
            startsAt: { lt: instantToDate(to) },
            endsAt: { gt: instantToDate(from) },
          },
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        });
        const references = await transaction.absenceWeekReference.findMany({
          where: {
            organizationId,
            weekStartsOn: plainDateToDate(weekStartsOn),
            employee: { siteId },
          },
          orderBy: { employeeId: 'asc' },
        });
        return {
          absences: absences.map(toAbsence),
          references: references.map(toAbsenceWeekReference),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
