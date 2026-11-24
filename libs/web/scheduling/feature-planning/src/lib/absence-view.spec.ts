import { absencesOn, weeklyHours } from './absence-view';

const PARIS = 'Europe/Paris';
const period = (startsAt: string, endsAt: string) => ({ startsAt, endsAt });

describe('absences lues dans l’instantané du calcul', () => {
  it('marque une journée entière d’absence', () => {
    const thursday = period('2026-11-26T00:00:00+01:00', '2026-11-27T00:00:00+01:00');

    expect(absencesOn([thursday], '2026-11-26', PARIS)).toEqual(['Absence']);
    expect(absencesOn([thursday], '2026-11-25', PARIS)).toEqual([]);
    expect(absencesOn([thursday], '2026-11-27', PARIS)).toEqual([]);
  });

  it('donne la plage horaire d’une absence sur une partie de la journée', () => {
    const morning = period('2026-11-23T06:00:00+01:00', '2026-11-23T10:00:00+01:00');

    expect(absencesOn([morning], '2026-11-23', PARIS)).toEqual(['Absence 06 h–10 h']);
  });

  it('borne une absence qui commence la veille ou finit le lendemain', () => {
    const night = period('2026-11-23T14:00:00+01:00', '2026-11-24T10:00:00+01:00');

    expect(absencesOn([night], '2026-11-23', PARIS)).toEqual(['Absence dès 14 h']);
    expect(absencesOn([night], '2026-11-24', PARIS)).toEqual(['Absence jusqu’à 10 h']);
  });

  it('lit la journée du passage à l’heure d’hiver dans le fuseau du site', () => {
    const shortNight = period('2026-10-25T00:00:00+02:00', '2026-10-26T00:00:00+01:00');

    expect(absencesOn([shortNight], '2026-10-25', PARIS)).toEqual(['Absence']);
  });

  it('chiffre les heures planifiées face au contrat, avec l’absence et le minimum restant', () => {
    const contract = { weeklyMinutesMin: 1680, weeklyMinutesMax: 2100, absenceMinutes: 420 };

    expect(weeklyHours(contract, 1680)).toEqual({
      plannedLabel: '28 h',
      absenceLabel: '7 h d’absence · minimum restant 21 h',
      contractLabel: 'Contrat 28–35 h',
    });
  });

  it('n’annonce ni absence ni minimum restant sans minutes d’absence, et ne descend pas sous zéro', () => {
    expect(weeklyHours({ weeklyMinutesMin: 840, weeklyMinutesMax: 1260 }, 840)).toEqual({
      plannedLabel: '14 h',
      absenceLabel: undefined,
      contractLabel: 'Contrat 14–21 h',
    });
    const longAbsence = { weeklyMinutesMin: 840, weeklyMinutesMax: 840, absenceMinutes: 1260 };
    expect(weeklyHours(longAbsence, 0).absenceLabel).toBe('21 h d’absence · minimum restant 0 h');
    expect(weeklyHours(longAbsence, 0).contractLabel).toBe('Contrat 14 h');
  });
});
