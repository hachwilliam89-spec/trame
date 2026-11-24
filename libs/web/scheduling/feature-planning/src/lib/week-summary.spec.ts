import { engineLabel, missingDetail } from './week-summary';

const gap = (date: string, dayAbbreviation: string, shiftLabel: string) => ({
  date,
  dayAbbreviation,
  shiftLabel,
});

describe('chiffres de la semaine', () => {
  it('situe un manque sur un seul créneau par son jour et son créneau', () => {
    const saturdayMorning = gap('2026-11-28', 'Sam.', 'Matin');

    expect(missingDetail([saturdayMorning, saturdayMorning])).toBe('sam. matin');
  });

  it('compte les créneaux quand les manques sont répartis', () => {
    const gaps = [gap('2026-11-28', 'Sam.', 'Matin'), gap('2026-11-23', 'Lun.', 'Matin')];

    expect(missingDetail(gaps)).toBe('sur 2 créneaux');
    expect(missingDetail([])).toBeUndefined();
  });

  it('donne la durée du calcul, à la française', () => {
    expect(engineLabel(4.2)).toBe('Proposé par le moteur · 4,2 s');
    expect(engineLabel(0.04)).toBe('Proposé par le moteur · moins de 0,1 s');
    expect(engineLabel(65)).toBe('Proposé par le moteur · 1 min 5 s');
  });
});
