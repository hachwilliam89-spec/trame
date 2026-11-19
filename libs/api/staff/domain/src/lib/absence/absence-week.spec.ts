import { weekBounds } from './absence-week';
import { InvalidWeekStartError } from './absence.errors';

describe('weekBounds', () => {
  it('va du lundi 0 h au lundi suivant 0 h, à l’heure du site', () => {
    const bounds = weekBounds(Temporal.PlainDate.from('2026-11-23'), 'Europe/Paris');

    expect(bounds.from.toString()).toBe('2026-11-22T23:00:00Z');
    expect(bounds.to.toString()).toBe('2026-11-29T23:00:00Z');
  });

  it('dure 169 heures la semaine du passage à l’heure d’hiver', () => {
    // Dimanche 25 octobre 2026 à 3 h, l'horloge de Paris recule à 2 h.
    const bounds = weekBounds(Temporal.PlainDate.from('2026-10-19'), 'Europe/Paris');

    expect(bounds.from.toString()).toBe('2026-10-18T22:00:00Z');
    expect(bounds.to.toString()).toBe('2026-10-25T23:00:00Z');
    expect(bounds.from.until(bounds.to).total('hours')).toBe(169);
  });

  it('refuse une semaine qui ne commence pas un lundi', () => {
    expect(() => weekBounds(Temporal.PlainDate.from('2026-11-24'), 'Europe/Paris')).toThrow(
      InvalidWeekStartError,
    );
  });
});
