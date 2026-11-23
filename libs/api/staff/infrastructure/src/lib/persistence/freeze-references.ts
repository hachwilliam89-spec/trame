import type { DatabaseClient } from '@trame/api/database';
import type { AbsenceWeekReference } from '@trame/api/staff/domain';
import { toAbsenceWeekReferenceRecord } from './absence-week-reference-record';

/** `skipDuplicates` : la première référence figée pour le salarié et la semaine l'emporte. */
export async function freezeReferences(
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
