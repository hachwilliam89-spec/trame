import {
  type Prisma,
  dateToInstant,
  dateToPlainDate,
  instantToDate,
  plainDateToDate,
} from '@trame/api/database';
import {
  type AbsenceWeekReference,
  type DayValuation,
  EqualShareReference,
  type InstantInterval,
  PlanningReference,
  type WorkedShift,
} from '@trame/api/staff/domain';
import { z } from 'zod';

/** Forme des colonnes JSON, relues par ces schémas : une ligne altérée ne passe pas inaperçue. */
const instantInterval = z.object({ startsAt: z.iso.datetime(), endsAt: z.iso.datetime() });
const workedShifts = z.array(instantInterval.extend({ breaks: z.array(instantInterval) }));
const activityDays = z.array(z.iso.date()).min(1);
const dayValuation = z.object({
  valuedMinutes: z.int().min(0),
  coveredPeriods: z.array(instantInterval),
});
const dayValuations = z.record(z.iso.date(), dayValuation);

type InstantIntervalRecord = z.infer<typeof instantInterval>;
type DayValuationRecord = z.infer<typeof dayValuation>;

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
    dayValuations: toDayValuations(dayValuations.parse(record.dayValuations)),
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

/** Valeur JSON de la durée d'un jour, telle que `day_valuations` la garde sous sa date. */
export function toDayValuationRecord(valuation: DayValuation): DayValuationRecord {
  return {
    valuedMinutes: valuation.valuedMinutes,
    coveredPeriods: valuation.coveredPeriods.map(fromInstantInterval),
  };
}

function dayValuationsOf(reference: EqualShareReference): Record<string, DayValuationRecord> {
  const records: Record<string, DayValuationRecord> = {};
  for (const [day, valuation] of reference.dayValuations) {
    records[day] = toDayValuationRecord(valuation);
  }
  return records;
}

function toDayValuations(records: Record<string, DayValuationRecord>): Map<string, DayValuation> {
  const valuations = new Map<string, DayValuation>();
  for (const [day, record] of Object.entries(records)) {
    valuations.set(day, {
      valuedMinutes: record.valuedMinutes,
      coveredPeriods: record.coveredPeriods.map(toInstantInterval),
    });
  }
  return valuations;
}

function toWorkedShift(shift: z.infer<typeof workedShifts>[number]): WorkedShift {
  return {
    startsAt: Temporal.Instant.from(shift.startsAt),
    endsAt: Temporal.Instant.from(shift.endsAt),
    breaks: shift.breaks.map(toInstantInterval),
  };
}

function fromWorkedShift(shift: WorkedShift): z.infer<typeof workedShifts>[number] {
  return {
    startsAt: shift.startsAt.toString(),
    endsAt: shift.endsAt.toString(),
    breaks: shift.breaks.map(fromInstantInterval),
  };
}

function toInstantInterval(record: InstantIntervalRecord): InstantInterval {
  return {
    start: Temporal.Instant.from(record.startsAt),
    end: Temporal.Instant.from(record.endsAt),
  };
}

function fromInstantInterval(interval: InstantInterval): InstantIntervalRecord {
  return { startsAt: interval.start.toString(), endsAt: interval.end.toString() };
}
