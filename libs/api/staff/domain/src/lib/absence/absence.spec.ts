import { Absence, type AbsenceProperties } from './absence';
import { InvalidAbsencePeriodError, InvalidAbsenceReasonError } from './absence.errors';

function instant(text: string): Temporal.Instant {
  return Temporal.Instant.from(text);
}

/** Inès Fabre en congé du mardi 24 au mercredi 25 novembre 2026, journées entières à Paris. */
function absenceProperties(overrides: Partial<AbsenceProperties> = {}): AbsenceProperties {
  return {
    id: '0190f0a0-0000-7000-8000-0000000000a1',
    organizationId: '0190f0a0-0000-7000-8000-00000000000a',
    employeeId: '0190f0a0-0000-7000-8000-0000000000e1',
    startsAt: instant('2026-11-24T00:00:00+01:00'),
    endsAt: instant('2026-11-26T00:00:00+01:00'),
    reason: 'LEAVE',
    createdAt: instant('2026-11-18T15:00:00Z'),
    ...overrides,
  };
}

describe('Absence', () => {
  it('garde sa période en instants, et son motif', () => {
    const absence = Absence.create(absenceProperties());

    expect(absence.startsAt.toString()).toBe('2026-11-23T23:00:00Z');
    expect(absence.endsAt.toString()).toBe('2026-11-25T23:00:00Z');
    expect(absence.reason).toBe('LEAVE');
  });

  it.each(['LEAVE', 'SICK_LEAVE', 'TRAINING', 'OTHER'] as const)(
    'accepte le motif %s',
    (reason) => {
      expect(() => Absence.create(absenceProperties({ reason }))).not.toThrow();
    },
  );

  it('refuse un motif hors des catégories', () => {
    const properties = absenceProperties({ reason: 'MALADIE' as never });

    expect(() => Absence.create(properties)).toThrow(InvalidAbsenceReasonError);
  });

  it.each([
    ['une fin qui précède le début', '2026-11-26T00:00:00+01:00', '2026-11-24T00:00:00+01:00'],
    ['une fin égale au début', '2026-11-24T06:00:00+01:00', '2026-11-24T06:00:00+01:00'],
  ])('refuse %s : la fin doit suivre le début', (_case, startsAt, endsAt) => {
    const properties = absenceProperties({ startsAt: instant(startsAt), endsAt: instant(endsAt) });

    expect(() => Absence.create(properties)).toThrow(InvalidAbsencePeriodError);
    expect(() => Absence.create(properties)).toThrow('La fin doit suivre le début.');
  });

  it('change de période et de motif sans changer d’employé ni de date de déclaration', () => {
    const absence = Absence.create(absenceProperties());

    const moved = absence.changeTo({
      startsAt: instant('2026-11-27T00:00:00+01:00'),
      endsAt: instant('2026-11-28T00:00:00+01:00'),
      reason: 'SICK_LEAVE',
    });

    expect(moved.id).toBe(absence.id);
    expect(moved.employeeId).toBe(absence.employeeId);
    expect(moved.createdAt).toEqual(absence.createdAt);
    expect(moved.startsAt.toString()).toBe('2026-11-26T23:00:00Z');
    expect(moved.reason).toBe('SICK_LEAVE');
  });

  it('refuse une modification dont la fin précède le début', () => {
    const absence = Absence.create(absenceProperties());

    expect(() =>
      absence.changeTo({
        startsAt: instant('2026-11-28T00:00:00+01:00'),
        endsAt: instant('2026-11-27T00:00:00+01:00'),
        reason: 'LEAVE',
      }),
    ).toThrow(InvalidAbsencePeriodError);
  });

  describe('chevauchement d’une période', () => {
    // Yanis Morel absent le jeudi 26 novembre de 6 h à 10 h, heure de Paris.
    const morning = Absence.create(
      absenceProperties({
        startsAt: instant('2026-11-26T06:00:00+01:00'),
        endsAt: instant('2026-11-26T10:00:00+01:00'),
      }),
    );

    it.each([
      [
        'le créneau du matin, 6 h – 13 h 20',
        '2026-11-26T06:00:00+01:00',
        '2026-11-26T13:20:00+01:00',
        true,
      ],
      [
        'une période qui finit à son début',
        '2026-11-26T05:00:00+01:00',
        '2026-11-26T06:00:00+01:00',
        false,
      ],
      [
        'une période qui commence à sa fin',
        '2026-11-26T10:00:00+01:00',
        '2026-11-26T13:20:00+01:00',
        false,
      ],
      [
        'l’après-midi, 13 h 30 – 20 h 50',
        '2026-11-26T13:30:00+01:00',
        '2026-11-26T20:50:00+01:00',
        false,
      ],
    ])('couvre %s : %s', (_case, from, to, expected) => {
      expect(morning.overlaps(instant(from), instant(to))).toBe(expected);
    });
  });
});
