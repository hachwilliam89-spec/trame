import { type Prisma, dateToInstant, instantToDate } from '@trame/api/database';
import { Absence, type AbsenceReason } from '@trame/api/staff/domain';

export function toAbsenceRecord(absence: Absence): Prisma.AbsenceUncheckedCreateInput {
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

export function toAbsence(record: Prisma.AbsenceModel): Absence {
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
