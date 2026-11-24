import {
  attemptTimeLabel,
  durationLabel,
  isoWeekNumber,
  localDateOf,
  localTimeLabel,
  shiftedWeek,
  weekDays,
  weekRangeLabel,
} from './calendar';

describe('calendrier du planning', () => {
  it('donne les sept jours de la semaine, du lundi au dimanche', () => {
    expect(
      weekDays('2026-11-23').map((day) => [day.date, day.name, day.abbreviation, day.dayOfMonth]),
    ).toEqual([
      ['2026-11-23', 'Lundi', 'Lun.', 23],
      ['2026-11-24', 'Mardi', 'Mar.', 24],
      ['2026-11-25', 'Mercredi', 'Mer.', 25],
      ['2026-11-26', 'Jeudi', 'Jeu.', 26],
      ['2026-11-27', 'Vendredi', 'Ven.', 27],
      ['2026-11-28', 'Samedi', 'Sam.', 28],
      ['2026-11-29', 'Dimanche', 'Dim.', 29],
    ]);
    expect(weekDays('2026-11-30')[6]?.date).toBe('2026-12-06');
  });

  it('numérote la semaine selon l’ISO 8601', () => {
    expect(isoWeekNumber('2026-11-23')).toBe(48);
    expect(isoWeekNumber('2026-12-28')).toBe(53);
    expect(isoWeekNumber('2027-01-04')).toBe(1);
  });

  it('écrit l’étendue de la semaine, sur un ou deux mois et sur deux années', () => {
    expect(weekRangeLabel('2026-11-23')).toBe('23–29 novembre 2026');
    expect(weekRangeLabel('2026-11-30')).toBe('30 novembre – 6 décembre 2026');
    expect(weekRangeLabel('2026-12-28')).toBe('28 décembre 2026 – 3 janvier 2027');
  });

  it('lit l’heure locale du site, changement d’heure compris', () => {
    expect(localTimeLabel('2026-11-23T05:00:00Z', 'Europe/Paris')).toBe('06 h');
    expect(localTimeLabel('2026-11-23T12:20:00Z', 'Europe/Paris')).toBe('13 h 20');
    expect(localTimeLabel('2026-07-06T04:00:00Z', 'Europe/Paris')).toBe('06 h');
  });

  it('écrit une durée en heures et minutes', () => {
    expect(durationLabel(2100)).toBe('35 h');
    expect(durationLabel(2070)).toBe('34 h 30');
    expect(durationLabel(0)).toBe('0 h');
  });

  it('passe à la semaine précédente ou suivante, d’une année à l’autre', () => {
    expect(shiftedWeek('2026-11-23', 1)).toBe('2026-11-30');
    expect(shiftedWeek('2026-11-23', -1)).toBe('2026-11-16');
    expect(shiftedWeek('2026-12-28', 1)).toBe('2027-01-04');
  });

  it('lit le jour civil d’un instant dans le fuseau du site', () => {
    expect(localDateOf('2026-11-25T23:00:00Z', 'Europe/Paris')).toBe('2026-11-26');
    expect(localDateOf('2026-11-25T22:59:00Z', 'Europe/Paris')).toBe('2026-11-25');
  });

  it('date une tentative de calcul à l’heure du site', () => {
    expect(attemptTimeLabel('2026-11-24T19:05:22.665Z', 'Europe/Paris')).toBe(
      'mardi 24 novembre à 20 h 05',
    );
  });
});
