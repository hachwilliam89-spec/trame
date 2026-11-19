import type { DatabaseClient } from '@trame/api/database';
import type { DayValuation, EqualShareReference, ValuedDay } from '@trame/api/staff/domain';
import { toDayValuationRecord } from './absence-week-reference-record';

/*
 * Instructions qui gardent la durée d'un jour partiel en accord avec les absences (US-033), dans
 * la transaction de l'écriture. Chaque transaction verrouille d'abord la référence de convention
 * de la semaine : deux écritures sur la même semaine de l'employé passent l'une après l'autre, et
 * les instructions de la seconde relisent les absences que la première a laissées. Sans ce
 * verrou, deux suppressions simultanées des deux absences d'un jour verraient chacune l'autre
 * absence encore là, et la durée survivrait au jour vide.
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
 * Verrouille les références des jours valorisés, semaine après semaine dans l'ordre : deux
 * transactions qui touchent les mêmes semaines les prennent dans le même ordre, sans s'interbloquer.
 */
export async function lockWeeksOfValuedDays(
  transaction: DatabaseClient,
  organizationId: string,
  employeeId: string,
  valuedDays: readonly ValuedDay[],
): Promise<void> {
  for (const weekStartsOn of distinctWeeksInOrder(valuedDays)) {
    await lockEqualShareReference(transaction, organizationId, employeeId, weekStartsOn);
  }
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

function distinctWeeksInOrder(valuedDays: readonly ValuedDay[]): Temporal.PlainDate[] {
  const weeks: Temporal.PlainDate[] = [];
  for (const valuedDay of valuedDays) {
    const isAlreadyListed = weeks.some((week) => week.equals(valuedDay.weekStartsOn));
    if (!isAlreadyListed) {
      weeks.push(valuedDay.weekStartsOn);
    }
  }
  return weeks.sort((first, second) => Temporal.PlainDate.compare(first, second));
}
