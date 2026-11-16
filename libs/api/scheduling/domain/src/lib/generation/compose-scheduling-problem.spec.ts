import { schedulingProblemV1 } from '@trame/shared/contracts';
import {
  composeSchedulingProblem,
  NoCoverageNeedError,
  WeekMustStartOnMondayError,
} from './compose-scheduling-problem';
import type { PlanningEmployee, PlanningShift, WeekPlanning } from './week-planning';

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
    ...overrides,
  };
}

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
      contract: { weeklyMinutesMin: 1680, weeklyMinutesMax: 2100 },
    });
  });

  it('applique les six règles du jalon 1 avec les valeurs du cadrage §6', () => {
    const { problem } = composeSchedulingProblem(planning());

    expect(problem.rules).toEqual([
      { id: 'HABILITATION_REQUISE' },
      { id: 'UN_SEUL_SHIFT' },
      { id: 'REPOS_QUOTIDIEN_MIN', minimumMinutes: 660 },
      { id: 'DUREE_QUOTIDIENNE_MAX', maximumMinutes: 600 },
      { id: 'DUREE_HEBDOMADAIRE_MAX', maximumMinutes: 2880 },
      { id: 'VOLUME_CONTRACTUEL' },
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
