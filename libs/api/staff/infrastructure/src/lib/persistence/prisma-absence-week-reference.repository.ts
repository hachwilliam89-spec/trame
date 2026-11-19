import { Injectable } from '@nestjs/common';
import { Database, plainDateToDate } from '@trame/api/database';
import type { AbsenceWeekReferenceRepository } from '@trame/api/staff/application';
import type { AbsenceWeekReference, EqualShareReference } from '@trame/api/staff/domain';
import { toAbsenceWeekReference } from './absence-week-reference-record';

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
  ): Promise<boolean> {
    const valuedMinutes = reference.dayValuations.get(day.toString());
    if (valuedMinutes === undefined) {
      throw new RangeError(`La référence ne donne aucune durée au ${day.toString()}.`);
    }
    // Une seule instruction remplace la durée de ce jour : l'UPDATE verrouille la ligne, et une
    // écriture concurrente repart de la valeur que celle-ci laisse. Réécrire toute la colonne
    // depuis une lecture antérieure effacerait la durée d'un autre jour. Prisma ne sait pas
    // modifier une seule clé d'une colonne JSON.
    const updated = await this.database.client.$executeRaw`
      UPDATE staff.absence_week_references
      SET day_valuations = jsonb_set(
        day_valuations, ARRAY[${day.toString()}::text], to_jsonb(${valuedMinutes}::integer)
      )
      WHERE organization_id = ${reference.organizationId}::uuid
        AND employee_id = ${reference.employeeId}::uuid
        AND week_starts_on = ${reference.weekStartsOn.toString()}::date
        AND method = ${reference.method}
    `;
    return updated === 1;
  }
}
