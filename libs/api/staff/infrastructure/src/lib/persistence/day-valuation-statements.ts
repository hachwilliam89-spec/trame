import { type DatabaseClient, plainDateToDate } from '@trame/api/database';
import { type DayValuation, EqualShareReference, type ValuedDay } from '@trame/api/staff/domain';
import { toAbsenceWeekReference, toDayValuationRecord } from './absence-week-reference-record';

/*
 * Instructions qui gardent la durée d'un jour partiel en accord avec les absences (US-033), dans
 * la transaction de l'écriture. Chaque transaction verrouille d'abord la référence de convention
 * de la semaine, puis relit ce qu'elle vérifie (jours valorisés, absences) : deux écritures sur
 * la même semaine de l'employé passent l'une après l'autre, et la seconde voit ce que la première
 * a laissé. Sans ce verrou, une durée saisie pendant la suppression de la dernière absence du
 * jour, ou deux suppressions simultanées des deux absences d'un jour, laisseraient une durée à un
 * jour vide.
 */

/** Verrouille la référence de convention de l'employé pour la semaine. Faux si elle n'existe pas. */
export async function lockEqualShareReference(
  transaction: DatabaseClient,
  organizationId: string,
  employeeId: string,
  weekStartsOn: Temporal.PlainDate,
): Promise<boolean> {
  const locked = await transaction.$queryRaw<{ found: number }[]>`
    SELECT 1 AS found FROM staff.absence_week_references
    WHERE organization_id = ${organizationId}::uuid
      AND employee_id = ${employeeId}::uuid
      AND week_starts_on = ${weekStartsOn.toString()}::date
      AND method = 'EQUAL_SHARE_OF_ACTIVITY_DAYS'
    FOR UPDATE
  `;
  return locked.length === 1;
}

/**
 * Verrouille les références de convention de ces semaines, dans l'ordre des semaines pour que deux
 * transactions ne s'interbloquent pas, puis relit leurs jours valorisés. Relus après le verrou,
 * ils comprennent une durée qu'une autre requête vient d'enregistrer.
 */
export async function lockValuedDaysOfWeeks(
  transaction: DatabaseClient,
  organizationId: string,
  employeeId: string,
  weeks: readonly Temporal.PlainDate[],
): Promise<ValuedDay[]> {
  const valuedDays: ValuedDay[] = [];
  for (const weekStartsOn of distinctInOrder(weeks)) {
    const isLocked = await lockEqualShareReference(
      transaction,
      organizationId,
      employeeId,
      weekStartsOn,
    );
    if (!isLocked) {
      continue;
    }
    const record = await transaction.absenceWeekReference.findUniqueOrThrow({
      where: {
        organizationId_employeeId_weekStartsOn: {
          organizationId,
          employeeId,
          weekStartsOn: plainDateToDate(weekStartsOn),
        },
      },
    });
    const reference = toAbsenceWeekReference(record);
    if (reference instanceof EqualShareReference) {
      valuedDays.push(...reference.valuedDays());
    }
  }
  return valuedDays;
}

/** Efface la durée de chaque jour qu'aucune absence de l'employé ne touche plus. */
export async function discardValuationsOfDaysWithoutAbsence(
  transaction: DatabaseClient,
  organizationId: string,
  employeeId: string,
  valuedDays: readonly ValuedDay[],
): Promise<void> {
  for (const valuedDay of valuedDays) {
    await transaction.$executeRaw`
      UPDATE staff.absence_week_references
      SET day_valuations = day_valuations - ${valuedDay.day.toString()}::text
      WHERE organization_id = ${organizationId}::uuid
        AND employee_id = ${employeeId}::uuid
        AND week_starts_on = ${valuedDay.weekStartsOn.toString()}::date
        AND method = 'EQUAL_SHARE_OF_ACTIVITY_DAYS'
        AND NOT EXISTS (
          SELECT 1 FROM staff.absences
          WHERE organization_id = ${organizationId}::uuid
            AND employee_id = ${employeeId}::uuid
            AND starts_at < ${valuedDay.bounds.end.toString()}::timestamptz
            AND ends_at > ${valuedDay.bounds.start.toString()}::timestamptz
        )
    `;
  }
}

/**
 * Pose la durée d'un jour, si une absence de l'employé le touche encore. `jsonb_set` ne remplace
 * que la clé de ce jour : une écriture concurrente sur un autre jour garde sa durée. Prisma ne
 * sait pas modifier une seule clé d'une colonne JSON. Faux si rien n'est posé.
 */
export async function setValuationOfDayWithAbsence(
  transaction: DatabaseClient,
  reference: EqualShareReference,
  day: Temporal.PlainDate,
  valuation: DayValuation,
): Promise<boolean> {
  const bounds = reference.boundsOf(day);
  const updated = await transaction.$executeRaw`
    UPDATE staff.absence_week_references
    SET day_valuations = jsonb_set(
      day_valuations,
      ARRAY[${day.toString()}::text],
      ${JSON.stringify(toDayValuationRecord(valuation))}::jsonb
    )
    WHERE organization_id = ${reference.organizationId}::uuid
      AND employee_id = ${reference.employeeId}::uuid
      AND week_starts_on = ${reference.weekStartsOn.toString()}::date
      AND method = 'EQUAL_SHARE_OF_ACTIVITY_DAYS'
      AND EXISTS (
        SELECT 1 FROM staff.absences
        WHERE organization_id = ${reference.organizationId}::uuid
          AND employee_id = ${reference.employeeId}::uuid
          AND starts_at < ${bounds.end.toString()}::timestamptz
          AND ends_at > ${bounds.start.toString()}::timestamptz
      )
  `;
  return updated === 1;
}

function distinctInOrder(weeks: readonly Temporal.PlainDate[]): Temporal.PlainDate[] {
  const distinct: Temporal.PlainDate[] = [];
  for (const week of weeks) {
    const isAlreadyListed = distinct.some((listed) => listed.equals(week));
    if (!isAlreadyListed) {
      distinct.push(week);
    }
  }
  return distinct.sort((first, second) => Temporal.PlainDate.compare(first, second));
}
