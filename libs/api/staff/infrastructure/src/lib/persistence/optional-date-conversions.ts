import { dateToPlainDate, plainDateToDate } from '@trame/api/database';

/** Un jour facultatif du domaine (`undefined`) correspond à une colonne `DATE` vide (`null`). */

export function optionalPlainDateToDate(date: Temporal.PlainDate | undefined): Date | null {
  if (date === undefined) {
    return null;
  }
  return plainDateToDate(date);
}

export function optionalDateToPlainDate(date: Date | null): Temporal.PlainDate | undefined {
  if (date === null) {
    return undefined;
  }
  return dateToPlainDate(date);
}
