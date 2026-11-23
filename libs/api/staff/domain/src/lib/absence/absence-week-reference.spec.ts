import { Absence, type AbsenceReason } from './absence';
import { valueAbsencesOfWeek } from './absence-week-reference';
import {
  InvalidDayValuationError,
  NoPartialAbsenceOnDayError,
  NotAnActivityDayError,
} from './absence.errors';
import { EqualShareReference } from './equal-share-reference';
import { PlanningReference, type WorkedShift } from './planning-reference';

const ORGANIZATION = '0190f0a0-0000-7000-8000-00000000000a';
const CAMILLE = '0190f0a0-0000-7000-8000-0000000000e1';
const PARIS = 'Europe/Paris';
const WEEK_OF_23_NOVEMBER = Temporal.PlainDate.from('2026-11-23');
const THURSDAY = Temporal.PlainDate.from('2026-11-26');
const FROZEN_AT = Temporal.Instant.from('2026-11-18T15:00:00Z');
const HOURS = 60;

/** Instant à l'heure de Paris en novembre 2026 (`2026-11-24T06:00`). */
function parisInstant(localDateTime: string): Temporal.Instant {
  return Temporal.Instant.from(`${localDateTime}+01:00`);
}

/** Créneau du matin d'un jour de novembre : 6 h – 13 h 20, pause de 10 h à 10 h 20 (7 h effectives). */
function morningShift(date: string): WorkedShift {
  return {
    startsAt: parisInstant(`${date}T06:00`),
    endsAt: parisInstant(`${date}T13:20`),
    breaks: [{ start: parisInstant(`${date}T10:00`), end: parisInstant(`${date}T10:20`) }],
  };
}

/** Camille Laurent travaille le matin du lundi au jeudi (4 × 7 h = 28 h), repos vendredi et samedi. */
function camilleReference(): PlanningReference {
  return PlanningReference.freeze({
    organizationId: ORGANIZATION,
    employeeId: CAMILLE,
    weekStartsOn: WEEK_OF_23_NOVEMBER,
    frozenAt: FROZEN_AT,
    generationId: '0190f0a0-0000-7000-8000-000000000a01',
    workedShifts: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'].map(morningShift),
  });
}

let absenceCount = 0;

/** Absence de Camille de `start` (inclus) à `end` (exclu), heure de Paris en novembre 2026. */
function absence(start: string, end: string, reason: AbsenceReason = 'LEAVE'): Absence {
  absenceCount += 1;
  return Absence.create({
    id: `0190f0a0-0000-7000-8000-${String(absenceCount).padStart(12, '0')}`,
    organizationId: ORGANIZATION,
    employeeId: CAMILLE,
    startsAt: parisInstant(start),
    endsAt: parisInstant(end),
    reason,
    createdAt: FROZEN_AT,
  });
}

function wholeDays(firstDay: string, dayAfterLast: string): Absence {
  return absence(`${firstDay}T00:00`, `${dayAfterLast}T00:00`);
}

/** Besoins du lundi 23 au samedi 28 novembre : six jours d'activité. */
function sixActivityDays(): Temporal.PlainDate[] {
  const days: Temporal.PlainDate[] = [];
  for (let offset = 0; offset < 6; offset += 1) {
    days.push(WEEK_OF_23_NOVEMBER.add({ days: offset }));
  }
  return days;
}

/** Camille, temps plein (28 h), sans planning de référence : convention de parts égales. */
function camilleByEqualShare(activityDays = sixActivityDays()): EqualShareReference {
  return EqualShareReference.freeze({
    organizationId: ORGANIZATION,
    employeeId: CAMILLE,
    weekStartsOn: WEEK_OF_23_NOVEMBER,
    frozenAt: FROZEN_AT,
    timeZone: PARIS,
    weeklyMinimumMinutes: 28 * HOURS,
    activityDays,
  });
}

describe('valorisation des absences sur un planning de référence (US-033)', () => {
  it('BDD : une journée prévue travaillée vaut ses 7 h effectives', () => {
    const valuation = camilleReference().value([wholeDays('2026-11-24', '2026-11-25')]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 7 * HOURS });
  });

  it('BDD : une absence sur un jour de repos ne vaut rien', () => {
    const valuation = camilleReference().value([wholeDays('2026-11-27', '2026-11-28')]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 0 });
  });

  it('BDD : une semaine entière vaut tout le planning de référence, 28 h', () => {
    const valuation = camilleReference().value([wholeDays('2026-11-23', '2026-11-30')]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 28 * HOURS });
  });

  it('BDD : une absence partielle hors pause vaut le temps qu’elle couvre, 4 h', () => {
    const valuation = camilleReference().value([absence('2026-11-25T06:00', '2026-11-25T10:00')]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 4 * HOURS });
  });

  it('BDD : une absence partielle qui recouvre la pause la retranche, sans prorata', () => {
    const valuation = camilleReference().value([absence('2026-11-25T06:00', '2026-11-25T11:00')]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 4 * HOURS + 40 });
  });

  it('BDD : deux absences qui se chevauchent ne comptent le mardi qu’une fois', () => {
    const leave = wholeDays('2026-11-24', '2026-11-25');
    const sickLeave = absence('2026-11-24T00:00', '2026-11-26T00:00', 'SICK_LEAVE');

    const valuation = camilleReference().value([leave, sickLeave]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 14 * HOURS });
  });

  it('BDD : sans le congé, l’arrêt qui couvre encore le mardi garde ses 14 h', () => {
    const sickLeave = absence('2026-11-24T00:00', '2026-11-26T00:00', 'SICK_LEAVE');

    const valuation = camilleReference().value([sickLeave]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 14 * HOURS });
  });

  it('ne compte rien quand le salarié n’a aucune absence active dans la semaine', () => {
    expect(camilleReference().value([])).toEqual({ status: 'VALUED', absenceMinutes: 0 });
  });

  it('compte la nuit du passage à l’heure d’hiver pour ses 9 h réelles, moins la pause', () => {
    // Nuit du samedi 24 au dimanche 25 octobre 2026 : 22 h – 6 h, l'horloge recule de 3 h à 2 h.
    const night: WorkedShift = {
      startsAt: Temporal.Instant.from('2026-10-24T22:00:00+02:00'),
      endsAt: Temporal.Instant.from('2026-10-25T06:00:00+01:00'),
      breaks: [
        {
          start: Temporal.Instant.from('2026-10-25T01:00:00+02:00'),
          end: Temporal.Instant.from('2026-10-25T01:30:00+02:00'),
        },
      ],
    };
    const reference = PlanningReference.freeze({
      organizationId: ORGANIZATION,
      employeeId: CAMILLE,
      weekStartsOn: Temporal.PlainDate.from('2026-10-19'),
      frozenAt: FROZEN_AT,
      generationId: '0190f0a0-0000-7000-8000-000000000a02',
      workedShifts: [night],
    });
    const wholeNight = Absence.create({
      id: '0190f0a0-0000-7000-8000-0000000000b1',
      organizationId: ORGANIZATION,
      employeeId: CAMILLE,
      startsAt: Temporal.Instant.from('2026-10-24T00:00:00+02:00'),
      endsAt: Temporal.Instant.from('2026-10-26T00:00:00+01:00'),
      reason: 'SICK_LEAVE',
      createdAt: FROZEN_AT,
    });

    expect(reference.value([wholeNight])).toEqual({
      status: 'VALUED',
      absenceMinutes: 9 * HOURS - 30,
    });
  });
});

describe('valorisation sans planning de référence : parts égales sur les jours d’activité', () => {
  it('BDD : la part journalière est le minimum divisé par les jours d’activité, 4 h 40', () => {
    expect(camilleByEqualShare().dailyShareMinutes).toBe(4 * HOURS + 40);
  });

  it('BDD : deux journées entières valent deux parts, 9 h 20', () => {
    const valuation = camilleByEqualShare().value([wholeDays('2026-11-24', '2026-11-26')]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 9 * HOURS + 20 });
  });

  it('BDD : une semaine entière vaut tout le minimum, qui tombe à zéro', () => {
    const valuation = camilleByEqualShare().value([wholeDays('2026-11-23', '2026-11-30')]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 28 * HOURS });
  });

  it('ne compte pas un jour sans activité, le dimanche', () => {
    const valuation = camilleByEqualShare().value([wholeDays('2026-11-29', '2026-11-30')]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 0 });
  });

  it('BDD : une absence partielle laisse le jour « à définir », sans le compter pour zéro', () => {
    const valuation = camilleByEqualShare().value([
      absence('2026-11-26T06:00', '2026-11-26T10:00'),
    ]);

    expect(valuation).toEqual({
      status: 'TO_DEFINE',
      daysToDefine: [Temporal.PlainDate.from('2026-11-26')],
    });
  });

  it('BDD : une durée donnée pour le jour partiel est valorisée telle quelle, 3 h', () => {
    const thursdayMorning = [absence('2026-11-26T06:00', '2026-11-26T10:00')];
    const reference = camilleByEqualShare().withDayValuation(THURSDAY, 3 * HOURS, thursdayMorning);

    expect(reference.value(thursdayMorning)).toEqual({
      status: 'VALUED',
      absenceMinutes: 3 * HOURS,
    });
  });

  it('compte une seule durée pour deux absences partielles le même jour', () => {
    const twoPartialAbsences = [
      absence('2026-11-26T06:00', '2026-11-26T08:00'),
      absence('2026-11-26T14:00', '2026-11-26T16:00'),
    ];
    const reference = camilleByEqualShare().withDayValuation(
      THURSDAY,
      3 * HOURS,
      twoPartialAbsences,
    );

    expect(reference.value(twoPartialAbsences)).toEqual({
      status: 'VALUED',
      absenceMinutes: 3 * HOURS,
    });
  });

  it('prend la part journalière quand le jour donné en partie est finalement couvert en entier', () => {
    const reference = camilleByEqualShare().withDayValuation(THURSDAY, HOURS, [
      absence('2026-11-26T06:00', '2026-11-26T10:00'),
    ]);

    const valuation = reference.value([wholeDays('2026-11-26', '2026-11-27')]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 4 * HOURS + 40 });
  });

  it('BDD : redemande la durée quand l’absence du jour change, 14 h – 16 h puis 14 h – 18 h', () => {
    const reference = camilleByEqualShare().withDayValuation(THURSDAY, 2 * HOURS, [
      absence('2026-11-26T14:00', '2026-11-26T16:00'),
    ]);

    const valuation = reference.value([absence('2026-11-26T14:00', '2026-11-26T18:00')]);

    expect(valuation).toEqual({ status: 'TO_DEFINE', daysToDefine: [THURSDAY] });
  });

  it('BDD : une autre absence du jour, saisie après la suppression, ne reprend pas la durée', () => {
    const reference = camilleByEqualShare().withDayValuation(THURSDAY, 2 * HOURS, [
      absence('2026-11-26T14:00', '2026-11-26T16:00'),
    ]);

    const valuation = reference.value([absence('2026-11-26T09:00', '2026-11-26T10:00')]);

    expect(valuation).toEqual({ status: 'TO_DEFINE', daysToDefine: [THURSDAY] });
  });

  it('BDD : garde la durée quand des absences remaniées couvrent le jour de la même façon', () => {
    const reference = camilleByEqualShare().withDayValuation(THURSDAY, 2 * HOURS, [
      absence('2026-11-26T14:00', '2026-11-26T16:00'),
    ]);

    const valuation = reference.value([
      absence('2026-11-26T14:00', '2026-11-26T15:00'),
      absence('2026-11-26T15:00', '2026-11-26T16:00'),
    ]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 2 * HOURS });
  });

  it('garde la durée d’un jour quand les absences d’un autre jour changent', () => {
    const thursdayAfternoon = absence('2026-11-26T14:00', '2026-11-26T16:00');
    const reference = camilleByEqualShare().withDayValuation(THURSDAY, 2 * HOURS, [
      thursdayAfternoon,
    ]);

    const valuation = reference.value([thursdayAfternoon, wholeDays('2026-11-24', '2026-11-25')]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 4 * HOURS + 40 + 2 * HOURS });
  });

  it('BDD : refuse une durée pour un jour qu’aucune absence ne couvre', () => {
    expect(() =>
      camilleByEqualShare().withDayValuation(THURSDAY, HOURS, [
        wholeDays('2026-11-24', '2026-11-25'),
      ]),
    ).toThrow(
      "Ce jour n'est pas couvert en partie par une absence : il n'y a pas de durée à donner.",
    );
  });

  it('refuse une durée pour un jour couvert en entier, qui vaut déjà sa part', () => {
    expect(() =>
      camilleByEqualShare().withDayValuation(THURSDAY, HOURS, [
        wholeDays('2026-11-26', '2026-11-27'),
      ]),
    ).toThrow(NoPartialAbsenceOnDayError);
  });

  it('BDD : refuse une durée au-delà de la part journalière', () => {
    const thursdayMorning = [absence('2026-11-26T06:00', '2026-11-26T10:00')];

    expect(() =>
      camilleByEqualShare().withDayValuation(THURSDAY, 5 * HOURS, thursdayMorning),
    ).toThrow('Durée refusée : au plus la part journalière, 4 h 40.');
    expect(() =>
      camilleByEqualShare().withDayValuation(THURSDAY, 5 * HOURS, thursdayMorning),
    ).toThrow(InvalidDayValuationError);
  });

  it.each([-1, 1.5])('refuse une durée de %s minutes', (minutes) => {
    expect(() =>
      camilleByEqualShare().withDayValuation(THURSDAY, minutes, [
        absence('2026-11-26T06:00', '2026-11-26T10:00'),
      ]),
    ).toThrow(InvalidDayValuationError);
  });

  it('refuse une durée pour un jour sans activité', () => {
    expect(() =>
      camilleByEqualShare().withDayValuation(Temporal.PlainDate.from('2026-11-29'), HOURS, [
        absence('2026-11-29T06:00', '2026-11-29T10:00'),
      ]),
    ).toThrow(NotAnActivityDayError);
  });

  it('compte le dimanche du passage à l’heure d’hiver, qui dure 25 h, comme une journée entière', () => {
    const weekOf19October = Temporal.PlainDate.from('2026-10-19');
    const reference = EqualShareReference.freeze({
      organizationId: ORGANIZATION,
      employeeId: CAMILLE,
      weekStartsOn: weekOf19October,
      frozenAt: FROZEN_AT,
      timeZone: PARIS,
      weeklyMinimumMinutes: 28 * HOURS,
      activityDays: [weekOf19October.add({ days: 6 })],
    });
    const sunday = Absence.create({
      id: '0190f0a0-0000-7000-8000-0000000000b2',
      organizationId: ORGANIZATION,
      employeeId: CAMILLE,
      startsAt: Temporal.Instant.from('2026-10-25T00:00:00+02:00'),
      endsAt: Temporal.Instant.from('2026-10-26T00:00:00+01:00'),
      reason: 'LEAVE',
      createdAt: FROZEN_AT,
    });

    expect(reference.value([sunday])).toEqual({ status: 'VALUED', absenceMinutes: 28 * HOURS });
  });

  it('donne les jours valorisés avec leurs bornes à l’heure du site, 25 h au passage à l’heure d’hiver', () => {
    const weekOf19October = Temporal.PlainDate.from('2026-10-19');
    const sunday = weekOf19October.add({ days: 6 });
    const reference = EqualShareReference.freeze({
      organizationId: ORGANIZATION,
      employeeId: CAMILLE,
      weekStartsOn: weekOf19October,
      frozenAt: FROZEN_AT,
      timeZone: PARIS,
      weeklyMinimumMinutes: 28 * HOURS,
      activityDays: [sunday],
    });
    const sundayMorning = Absence.create({
      id: '0190f0a0-0000-7000-8000-0000000000b3',
      organizationId: ORGANIZATION,
      employeeId: CAMILLE,
      startsAt: Temporal.Instant.from('2026-10-25T06:00:00+01:00'),
      endsAt: Temporal.Instant.from('2026-10-25T10:00:00+01:00'),
      reason: 'LEAVE',
      createdAt: FROZEN_AT,
    });

    const valuedDays = reference.withDayValuation(sunday, HOURS, [sundayMorning]).valuedDays();

    expect(valuedDays).toEqual([
      {
        weekStartsOn: weekOf19October,
        day: sunday,
        bounds: {
          start: Temporal.Instant.from('2026-10-24T22:00:00Z'),
          end: Temporal.Instant.from('2026-10-25T23:00:00Z'),
        },
      },
    ]);
    expect(camilleByEqualShare().valuedDays()).toEqual([]);
  });

  it('refuse une convention sans jour d’activité, ou avec un jour hors de la semaine', () => {
    expect(() => camilleByEqualShare([])).toThrow(RangeError);
    expect(() => camilleByEqualShare([Temporal.PlainDate.from('2026-11-30')])).toThrow(RangeError);
  });
});

describe('valueAbsencesOfWeek', () => {
  it('BDD : sans référence figée, une absence de la semaine reste « à définir »', () => {
    const valuation = valueAbsencesOfWeek(undefined, [wholeDays('2026-11-30', '2026-12-01')]);

    expect(valuation).toEqual({ status: 'TO_DEFINE', daysToDefine: [] });
  });

  it('ne demande rien quand le salarié n’a pas d’absence dans la semaine', () => {
    expect(valueAbsencesOfWeek(undefined, [])).toEqual({ status: 'VALUED', absenceMinutes: 0 });
  });

  it('délègue à la référence figée quand elle existe', () => {
    const valuation = valueAbsencesOfWeek(camilleReference(), [
      wholeDays('2026-11-24', '2026-11-25'),
    ]);

    expect(valuation).toEqual({ status: 'VALUED', absenceMinutes: 7 * HOURS });
  });
});
