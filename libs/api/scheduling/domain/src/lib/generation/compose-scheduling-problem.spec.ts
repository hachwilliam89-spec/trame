import { schedulingProblemV1 } from '@trame/shared/contracts';
import {
  composeSchedulingProblem,
  NoCoverageNeedError,
  WeekMustStartOnMondayError,
} from './compose-scheduling-problem';
import type {
  PlanningAbsence,
  PlanningEmployee,
  PlanningShift,
  WeekPlanning,
} from './week-planning';

const SITE_ID = '0190f0a0-0000-7000-8000-0000000000d1';
const MORNING = '0190f0a0-0000-7000-8000-000000000011';
const FORKLIFT = '0190f0a0-0000-7000-8000-000000000021';
const CACES_3 = '0190f0a0-0000-7000-8000-000000000031';
const MONDAY = Temporal.PlainDate.from('2026-11-23');

function morningShift(date: string, requiredCount = 2): PlanningShift {
  return {
    date: Temporal.PlainDate.from(date),
    shiftTemplateId: MORNING,
    positionId: FORKLIFT,
    startsAt: Temporal.ZonedDateTime.from(`${date}T06:00[Europe/Paris]`).toInstant(),
    endsAt: Temporal.ZonedDateTime.from(`${date}T13:20[Europe/Paris]`).toInstant(),
    effectiveMinutes: 420,
    requiredSkillIds: [CACES_3],
    requiredCount,
  };
}

function employee(id: string, contracts: PlanningEmployee['contracts']): PlanningEmployee {
  return {
    id,
    qualifications: [{ skillId: CACES_3, expiresOn: Temporal.PlainDate.from('2026-11-25') }],
    contracts,
  };
}

const fullTime = {
  weeklyMinutesMin: 1680,
  weeklyMinutesMax: 2100,
  startsOn: Temporal.PlainDate.from('2026-01-05'),
  endsOn: undefined,
};

function planning(overrides: Partial<WeekPlanning> = {}): WeekPlanning {
  return {
    siteId: SITE_ID,
    weekStartsOn: MONDAY,
    timeZone: 'Europe/Paris',
    shifts: [morningShift('2026-11-24'), morningShift('2026-11-23', 3)],
    employees: [
      employee('0190f0a0-0000-7000-8000-000000000042', [fullTime]),
      employee('0190f0a0-0000-7000-8000-000000000041', [fullTime]),
    ],
    absences: [],
    absenceValuations: [],
    employeesWithAbsenceToDefine: [],
    ...overrides,
  };
}

const CAMILLE = '0190f0a0-0000-7000-8000-000000000041';
const YANIS = '0190f0a0-0000-7000-8000-000000000042';

function parisInstant(localDateTime: string): Temporal.Instant {
  return Temporal.ZonedDateTime.from(`${localDateTime}[Europe/Paris]`).toInstant();
}

function absence(employeeId: string, start: string, end: string): PlanningAbsence {
  return { employeeId, startsAt: parisInstant(start), endsAt: parisInstant(end) };
}

const SIX_ACTIVITY_DAYS = [
  '2026-11-23',
  '2026-11-24',
  '2026-11-25',
  '2026-11-26',
  '2026-11-27',
  '2026-11-28',
];

describe('Composer le problème d’une semaine', () => {
  it('produit un problème conforme au contrat du moteur, trié pour être rejoué', () => {
    const { problem } = composeSchedulingProblem(planning());

    expect(schedulingProblemV1.safeParse(problem).success).toBe(true);
    expect(problem.weekStartsOn).toBe('2026-11-23');
    expect(problem.shifts.map((shift) => shift.id)).toEqual([
      `2026-11-23/${MORNING}/${FORKLIFT}`,
      `2026-11-24/${MORNING}/${FORKLIFT}`,
    ]);
    expect(problem.employees.map((candidate) => candidate.id)).toEqual([
      '0190f0a0-0000-7000-8000-000000000041',
      '0190f0a0-0000-7000-8000-000000000042',
    ]);
  });

  it('exprime les horaires dans le fuseau du site, avec leur décalage', () => {
    const { problem } = composeSchedulingProblem(planning());

    expect(problem.shifts[0]).toMatchObject({
      date: '2026-11-23',
      startsAt: '2026-11-23T06:00:00+01:00',
      endsAt: '2026-11-23T13:20:00+01:00',
      effectiveMinutes: 420,
      requiredCount: 3,
    });
  });

  it('garde l’habilitation et sa date d’expiration, et le contrat de la semaine', () => {
    const { problem } = composeSchedulingProblem(planning());

    expect(problem.employees[0]).toEqual({
      id: '0190f0a0-0000-7000-8000-000000000041',
      qualifications: [{ skillId: CACES_3, expiresOn: '2026-11-25' }],
      unavailabilities: [],
      contract: { weeklyMinutesMin: 1680, weeklyMinutesMax: 2100, absenceMinutes: 0 },
    });
  });

  it('applique les règles du jalon 1 avec les valeurs du cadrage §6, et les indisponibilités', () => {
    const { problem } = composeSchedulingProblem(planning());

    expect(problem.rules).toEqual([
      { id: 'HABILITATION_REQUISE' },
      { id: 'UN_SEUL_SHIFT' },
      { id: 'REPOS_QUOTIDIEN_MIN', minimumMinutes: 660 },
      { id: 'DUREE_QUOTIDIENNE_MAX', maximumMinutes: 600 },
      { id: 'DUREE_HEBDOMADAIRE_MAX', maximumMinutes: 2880 },
      { id: 'VOLUME_CONTRACTUEL' },
      { id: 'INDISPONIBILITE' },
    ]);
    expect(problem.objective).toEqual({ mode: 'STANDARD' });
  });

  it('écarte un salarié dont aucun contrat ne couvre toute la semaine, et dit pourquoi', () => {
    const startsWednesday = { ...fullTime, startsOn: Temporal.PlainDate.from('2026-11-25') };
    const endsSaturday = { ...fullTime, endsOn: Temporal.PlainDate.from('2026-11-28') };
    const coversTheWeek = { ...fullTime, endsOn: Temporal.PlainDate.from('2026-11-29') };

    const { problem, excludedEmployees } = composeSchedulingProblem(
      planning({
        employees: [
          employee('0190f0a0-0000-7000-8000-000000000043', [startsWednesday]),
          employee('0190f0a0-0000-7000-8000-000000000044', [endsSaturday]),
          employee('0190f0a0-0000-7000-8000-000000000045', []),
          employee('0190f0a0-0000-7000-8000-000000000046', [coversTheWeek]),
        ],
      }),
    );

    expect(problem.employees.map((candidate) => candidate.id)).toEqual([
      '0190f0a0-0000-7000-8000-000000000046',
    ]);
    expect(excludedEmployees).toEqual([
      { employeeId: '0190f0a0-0000-7000-8000-000000000043', reason: 'NO_CONTRACT_COVERING_WEEK' },
      { employeeId: '0190f0a0-0000-7000-8000-000000000044', reason: 'NO_CONTRACT_COVERING_WEEK' },
      { employeeId: '0190f0a0-0000-7000-8000-000000000045', reason: 'NO_CONTRACT_COVERING_WEEK' },
    ]);
  });

  describe('absences (US-033)', () => {
    it('BDD : une absence devient une indisponibilité du salarié, avec le décalage du site', () => {
      const { problem } = composeSchedulingProblem(
        planning({ absences: [absence(CAMILLE, '2026-11-24T00:00', '2026-11-26T00:00')] }),
      );

      expect(problem.employees[0]?.unavailabilities).toEqual([
        { startsAt: '2026-11-24T00:00:00+01:00', endsAt: '2026-11-26T00:00:00+01:00' },
      ]);
      expect(problem.employees[1]?.unavailabilities).toEqual([]);
    });

    it('garde une absence du lundi suivant qui touche un créneau du dimanche, sans la couper', () => {
      const sundayNight: PlanningShift = {
        ...morningShift('2026-11-29'),
        startsAt: parisInstant('2026-11-29T22:00'),
        endsAt: parisInstant('2026-11-30T06:00'),
      };
      const nextMonday = absence(CAMILLE, '2026-11-30T00:00', '2026-11-30T12:00');
      const thursdayWithoutShift = absence(CAMILLE, '2026-11-26T00:00', '2026-11-27T00:00');

      const { problem } = composeSchedulingProblem(
        planning({
          shifts: [morningShift('2026-11-24'), sundayNight],
          absences: [thursdayWithoutShift, nextMonday],
        }),
      );

      expect(problem.employees[0]?.unavailabilities).toEqual([
        { startsAt: '2026-11-30T00:00:00+01:00', endsAt: '2026-11-30T12:00:00+01:00' },
      ]);
    });

    it('BDD : besoins ajoutés après la déclaration, le minimum restant est de 23 h 20 avec l’indisponibilité du lundi', () => {
      const valuation = {
        employeeId: CAMILLE,
        absenceMinutes: 280,
        method: 'EQUAL_SHARE_OF_ACTIVITY_DAYS' as const,
        weeklyMinimumMinutes: 1680,
        activityDays: SIX_ACTIVITY_DAYS,
        dailyShareMinutes: 280,
      };

      const { problem, absenceValuations } = composeSchedulingProblem(
        planning({
          shifts: [morningShift('2026-11-23'), morningShift('2026-11-24')],
          absences: [absence(CAMILLE, '2026-11-23T00:00', '2026-11-24T00:00')],
          absenceValuations: [valuation],
        }),
      );

      const camille = problem.employees[0];
      expect(camille?.contract).toEqual({
        weeklyMinutesMin: 1680,
        weeklyMinutesMax: 2100,
        absenceMinutes: 280,
      });
      const remainingMinimum =
        (camille?.contract.weeklyMinutesMin ?? 0) - (camille?.contract.absenceMinutes ?? 0);
      expect(remainingMinimum).toBe(23 * 60 + 20);
      expect(camille?.unavailabilities).toEqual([
        { startsAt: '2026-11-23T00:00:00+01:00', endsAt: '2026-11-24T00:00:00+01:00' },
      ]);
      expect(absenceValuations).toEqual([valuation]);
    });

    it('BDD : écarte un salarié dont la valorisation est « à définir », et dit pourquoi', () => {
      const { problem, excludedEmployees, absenceValuations } = composeSchedulingProblem(
        planning({
          absences: [absence(CAMILLE, '2026-11-24T06:00', '2026-11-24T10:00')],
          employeesWithAbsenceToDefine: [CAMILLE],
        }),
      );

      expect(problem.employees.map((candidate) => candidate.id)).toEqual([YANIS]);
      expect(excludedEmployees).toEqual([
        { employeeId: CAMILLE, reason: 'ABSENCE_VALUATION_TO_DEFINE' },
      ]);
      expect(absenceValuations).toEqual([]);
    });

    it('garde le motif « sans contrat » pour un salarié sans contrat et sans valorisation', () => {
      const { excludedEmployees } = composeSchedulingProblem(
        planning({
          employees: [employee(CAMILLE, [])],
          employeesWithAbsenceToDefine: [CAMILLE],
        }),
      );

      expect(excludedEmployees).toEqual([
        { employeeId: CAMILLE, reason: 'NO_CONTRACT_COVERING_WEEK' },
      ]);
    });
  });

  it('refuse une semaine sans besoin de couverture', () => {
    expect(() => composeSchedulingProblem(planning({ shifts: [] }))).toThrow(NoCoverageNeedError);
  });

  it('refuse une semaine qui ne commence pas un lundi', () => {
    const tuesday = Temporal.PlainDate.from('2026-11-24');

    expect(() => composeSchedulingProblem(planning({ weekStartsOn: tuesday }))).toThrow(
      WeekMustStartOnMondayError,
    );
  });
});
