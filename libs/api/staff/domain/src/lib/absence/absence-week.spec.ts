import { Absence } from './absence';
import { weekBounds, weeksTouchedBy } from './absence-week';
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

describe('weeksTouchedBy', () => {
  function absence(startsAt: string, endsAt: string): Absence {
    return Absence.create({
      id: '0190f0a0-0000-7000-8000-0000000000a1',
      organizationId: '0190f0a0-0000-7000-8000-00000000000a',
      employeeId: '0190f0a0-0000-7000-8000-0000000000e1',
      startsAt: Temporal.Instant.from(startsAt),
      endsAt: Temporal.Instant.from(endsAt),
      reason: 'LEAVE',
      createdAt: Temporal.Instant.from('2026-11-18T15:00:00Z'),
    });
  }

  function mondays(weeks: Temporal.PlainDate[]): string[] {
    return weeks.map((monday) => monday.toString());
  }

  it('donne le lundi de la seule semaine touchée', () => {
    const tuesday = absence('2026-11-24T00:00:00+01:00', '2026-11-25T00:00:00+01:00');

    expect(mondays(weeksTouchedBy(tuesday, 'Europe/Paris'))).toEqual(['2026-11-23']);
  });

  it('ne compte pas la semaine suivante pour une absence qui finit le lundi à minuit', () => {
    const untilMonday = absence('2026-11-27T00:00:00+01:00', '2026-11-30T00:00:00+01:00');

    expect(mondays(weeksTouchedBy(untilMonday, 'Europe/Paris'))).toEqual(['2026-11-23']);
  });

  it('donne chaque semaine d’une absence à cheval, à l’heure du site', () => {
    // Dimanche 29 novembre 23 h à Paris, soit 22 h UTC, jusqu'au mardi 8 décembre.
    const acrossWeeks = absence('2026-11-29T23:00:00+01:00', '2026-12-08T00:00:00+01:00');

    expect(mondays(weeksTouchedBy(acrossWeeks, 'Europe/Paris'))).toEqual([
      '2026-11-23',
      '2026-11-30',
      '2026-12-07',
    ]);
  });
});
