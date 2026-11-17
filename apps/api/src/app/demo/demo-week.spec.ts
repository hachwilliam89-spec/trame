import { nextMondayAfter, todayIn } from './demo-week';

const PARIS = 'Europe/Paris';
const instant = (text: string): Temporal.Instant => Temporal.Instant.from(text);
const date = (text: string): Temporal.PlainDate => Temporal.PlainDate.from(text);

describe('semaine du jeu de démonstration', () => {
  it('prend le jour du calendrier de Paris, pas celui de UTC', () => {
    expect(todayIn(instant('2026-11-22T22:59:59Z'), PARIS)).toEqual(date('2026-11-22'));
    expect(todayIn(instant('2026-11-22T23:30:00Z'), PARIS)).toEqual(date('2026-11-23'));
  });

  it('retient le lundi qui suit, quel que soit le jour de la semaine', () => {
    expect(nextMondayAfter(date('2026-11-17'))).toEqual(date('2026-11-23')); // mardi
    expect(nextMondayAfter(date('2026-11-22'))).toEqual(date('2026-11-23')); // dimanche
    expect(nextMondayAfter(date('2026-11-23'))).toEqual(date('2026-11-30')); // lundi
  });

  it('dimanche à 23 h 30 UTC, il est déjà lundi à Paris : la semaine est celle d’après', () => {
    const today = todayIn(instant('2026-11-22T23:30:00Z'), PARIS);

    expect(nextMondayAfter(today)).toEqual(date('2026-11-30'));
  });

  it('la nuit du passage à l’heure d’hiver ne décale pas la semaine', () => {
    // Dimanche 25 octobre 2026 : 3 h devient 2 h à Paris.
    const duringChange = todayIn(instant('2026-10-25T00:30:00Z'), PARIS);
    const afterChange = todayIn(instant('2026-10-25T22:30:00Z'), PARIS);

    expect(duringChange).toEqual(date('2026-10-25'));
    expect(afterChange).toEqual(date('2026-10-25'));
    expect(nextMondayAfter(duringChange)).toEqual(date('2026-10-26'));
  });
});
