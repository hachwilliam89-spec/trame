import {
  type Prisma,
  dateToInstant,
  dateToPlainDate,
  instantToDate,
  plainDateToDate,
} from '@trame/api/database';
import {
  type AbsenceWeekReference,
  EqualShareReference,
  PlanningReference,
  type WorkedShift,
} from '@trame/api/staff/domain';
import { z } from 'zod';

/** Forme des colonnes JSON, relues par ces schémas : une ligne altérée ne passe pas inaperçue. */
const instantInterval = z.object({ startsAt: z.iso.datetime(), endsAt: z.iso.datetime() });
const workedShifts = z.array(instantInterval.extend({ breaks: z.array(instantInterval) }));
const activityDays = z.array(z.iso.date()).min(1);
const dayValuations = z.record(z.iso.date(), z.int().min(0));

export function toAbsenceWeekReference(
  record: Prisma.AbsenceWeekReferenceModel,
): AbsenceWeekReference {
  const frozen = {
    organizationId: record.organizationId,
    employeeId: record.employeeId,
    weekStartsOn: dateToPlainDate(record.weekStartsOn),
    frozenAt: dateToInstant(record.frozenAt),
  };
  if (record.method === 'REFERENCE_PLANNING') {
    return PlanningReference.freeze({
      ...frozen,
      generationId: z.uuid().parse(record.generationId),
      workedShifts: workedShifts.parse(record.workedShifts).map(toWorkedShift),
    });
  }
  return EqualShareReference.freeze({
    ...frozen,
    timeZone: z.string().min(1).parse(record.timeZone),
    weeklyMinimumMinutes: z.int().min(0).parse(record.weeklyMinimumMinutes),
    activityDays: activityDays
      .parse(record.activityDays)
      .map((day) => Temporal.PlainDate.from(day)),
    dayValuations: new Map(Object.entries(dayValuations.parse(record.dayValuations))),
  });
}

/** Colonnes d'une référence à créer ; la contrainte de la table vérifie leur cohérence. */
export function toAbsenceWeekReferenceRecord(
  reference: AbsenceWeekReference,
): Prisma.AbsenceWeekReferenceCreateManyInput {
  const frozen = {
    organizationId: reference.organizationId,
    employeeId: reference.employeeId,
    weekStartsOn: plainDateToDate(reference.weekStartsOn),
    method: reference.method,
    frozenAt: instantToDate(reference.frozenAt),
  };
  if (reference instanceof PlanningReference) {
    return {
      ...frozen,
      generationId: reference.generationId,
      workedShifts: reference.workedShifts.map(fromWorkedShift),
    };
  }
  if (reference instanceof EqualShareReference) {
    return {
      ...frozen,
      timeZone: reference.timeZone,
      weeklyMinimumMinutes: reference.weeklyMinimumMinutes,
      activityDays: reference.activityDays.map((day) => day.toString()),
      dayValuations: dayValuationsOf(reference),
    };
  }
  throw new TypeError(`Méthode de valorisation inconnue : ${reference.method}.`);
}

export function dayValuationsOf(reference: EqualShareReference): Record<string, number> {
  return Object.fromEntries(reference.dayValuations);
}

function toWorkedShift(shift: z.infer<typeof workedShifts>[number]): WorkedShift {
  return {
    startsAt: Temporal.Instant.from(shift.startsAt),
    endsAt: Temporal.Instant.from(shift.endsAt),
    breaks: shift.breaks.map((shiftBreak) => ({
      start: Temporal.Instant.from(shiftBreak.startsAt),
      end: Temporal.Instant.from(shiftBreak.endsAt),
    })),
  };
}

function fromWorkedShift(shift: WorkedShift): z.infer<typeof workedShifts>[number] {
  return {
    startsAt: shift.startsAt.toString(),
    endsAt: shift.endsAt.toString(),
    breaks: shift.breaks.map((shiftBreak) => ({
      startsAt: shiftBreak.start.toString(),
      endsAt: shiftBreak.end.toString(),
    })),
  };
}
