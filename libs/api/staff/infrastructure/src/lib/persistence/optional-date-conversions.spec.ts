import { optionalDateToPlainDate, optionalPlainDateToDate } from './optional-date-conversions';

describe('conversion d’un jour facultatif pour une colonne DATE', () => {
  it('écrit un jour comme minuit UTC, et le relit à l’identique', () => {
    const stored = optionalPlainDateToDate(Temporal.PlainDate.from('2026-12-09'));

    expect(stored?.toISOString()).toBe('2026-12-09T00:00:00.000Z');
    expect(optionalDateToPlainDate(stored)?.toString()).toBe('2026-12-09');
  });

  it('traduit une date absente par une colonne vide', () => {
    expect(optionalPlainDateToDate(undefined)).toBeNull();
    expect(optionalDateToPlainDate(null)).toBeUndefined();
  });
});
