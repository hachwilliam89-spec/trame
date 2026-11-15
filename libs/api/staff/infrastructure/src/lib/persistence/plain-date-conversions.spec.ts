import { dateToPlainDate, plainDateToDate } from './plain-date-conversions';

describe('conversion des jours pour une colonne DATE', () => {
  it('écrit un jour comme minuit UTC, et le relit à l’identique', () => {
    const expiresOn = Temporal.PlainDate.from('2026-12-09');

    const stored = plainDateToDate(expiresOn);

    expect(stored?.toISOString()).toBe('2026-12-09T00:00:00.000Z');
    expect(dateToPlainDate(stored)?.toString()).toBe('2026-12-09');
  });

  it('garde le jour d’un changement d’heure : la conversion ne dépend pas du fuseau du site', () => {
    const lastSundayOfOctober = Temporal.PlainDate.from('2026-10-25');

    const stored = plainDateToDate(lastSundayOfOctober);

    expect(dateToPlainDate(stored)?.toString()).toBe('2026-10-25');
  });

  it('traduit une habilitation sans date d’expiration par une colonne vide', () => {
    expect(plainDateToDate(undefined)).toBeNull();
    expect(dateToPlainDate(null)).toBeUndefined();
  });
});
