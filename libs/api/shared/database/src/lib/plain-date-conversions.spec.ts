import { dateToPlainDate, plainDateToDate } from './plain-date-conversions';

describe('conversions PlainDate ↔ Date, pour une colonne DATE', () => {
  it('écrit un jour comme minuit UTC, et le relit à l’identique', () => {
    const stored = plainDateToDate(Temporal.PlainDate.from('2026-12-09'));

    expect(stored.toISOString()).toBe('2026-12-09T00:00:00.000Z');
    expect(dateToPlainDate(stored).toString()).toBe('2026-12-09');
  });

  it('garde le jour d’un changement d’heure : la conversion ne dépend pas du fuseau du site', () => {
    const lastSundayOfOctober = Temporal.PlainDate.from('2026-10-25');

    expect(dateToPlainDate(plainDateToDate(lastSundayOfOctober)).toString()).toBe('2026-10-25');
  });
});
