import type { ScheduleOutcomeV1, SchedulingProblemV1 } from '@trame/shared/contracts';
import { advanceGeneration, InconsistentScheduleError } from './advance-generation';
import type { ScheduleGeneration } from './schedule-generation';

const MORNING =
  '2026-11-23/0190f0a0-0000-7000-8000-000000000011/0190f0a0-0000-7000-8000-000000000021';
const AFTERNOON =
  '2026-11-23/0190f0a0-0000-7000-8000-000000000012/0190f0a0-0000-7000-8000-000000000021';
const CAMILLE = '0190f0a0-0000-7000-8000-000000000041';
const SACHA = '0190f0a0-0000-7000-8000-000000000042';
const EXCLUDED = '0190f0a0-0000-7000-8000-000000000049';
const now = Temporal.Instant.from('2026-11-16T21:00:30Z');

function shift(id: string, requiredCount: number): SchedulingProblemV1['shifts'][number] {
  return {
    id,
    date: '2026-11-23',
    shiftTemplateId: '0190f0a0-0000-7000-8000-000000000011',
    positionId: '0190f0a0-0000-7000-8000-000000000021',
    startsAt: '2026-11-23T06:00:00+01:00',
    endsAt: '2026-11-23T13:20:00+01:00',
    effectiveMinutes: 420,
    requiredSkillIds: [],
    requiredCount,
  };
}

function employee(id: string): SchedulingProblemV1['employees'][number] {
  return { id, qualifications: [], contract: { weeklyMinutesMin: 0, weeklyMinutesMax: 2100 } };
}

const queued: ScheduleGeneration = {
  id: '0190f0a0-0000-7000-8000-0000000000e1',
  organizationId: '0190f0a0-0000-7000-8000-00000000000a',
  siteId: '0190f0a0-0000-7000-8000-0000000000d1',
  weekStartsOn: Temporal.PlainDate.from('2026-11-23'),
  status: 'QUEUED',
  problem: {
    weekStartsOn: '2026-11-23',
    timeZone: 'Europe/Paris',
    shifts: [shift(MORNING, 3), shift(AFTERNOON, 1)],
    employees: [employee(CAMILLE), employee(SACHA)],
    rules: [{ id: 'UN_SEUL_SHIFT' }],
    objective: { mode: 'STANDARD' },
  },
  parameters: { timeLimitSeconds: 30, workers: 1, seed: 0 },
  excludedEmployees: [{ employeeId: EXCLUDED, reason: 'NO_CONTRACT_COVERING_WEEK' }],
  createdAt: Temporal.Instant.from('2026-11-16T21:00:00Z'),
};

type Schedule = NonNullable<ScheduleOutcomeV1['result']['schedule']>;

function result(schedule: Schedule): { kind: 'RESULT'; outcome: ScheduleOutcomeV1 } {
  return {
    kind: 'RESULT',
    outcome: {
      result: { status: 'FEASIBLE', schedule },
      checkedRules: ['UN_SEUL_SHIFT'],
      solveSeconds: 0.4,
    },
  };
}

const coherent: Schedule = {
  assignments: [
    { shiftId: MORNING, employeeId: CAMILLE },
    { shiftId: MORNING, employeeId: SACHA },
  ],
  shortfalls: [
    { shiftId: MORNING, requiredCount: 3, assignedCount: 2 },
    { shiftId: AFTERNOON, requiredCount: 1, assignedCount: 0 },
  ],
};

describe('Avancer une génération selon les rapports du moteur', () => {
  it('passe en cours au départ, une seule fois', () => {
    const running = advanceGeneration(queued, { kind: 'STARTED' }, now);

    expect(running?.status).toBe('RUNNING');
    expect(advanceGeneration({ ...queued, status: 'RUNNING' }, { kind: 'STARTED' }, now)).toBe(
      undefined,
    );
  });

  it('garde un planning cohérent avec le problème envoyé, et l’instant de fin', () => {
    const solved = advanceGeneration(queued, result(coherent), now);

    expect(solved).toMatchObject({ status: 'SUCCEEDED', outcome: result(coherent).outcome });
    expect(solved?.finishedAt?.equals(now)).toBe(true);
  });

  it.each([
    ['INFEASIBLE', { status: 'INFEASIBLE', schedule: null }],
    ['UNKNOWN', { status: 'UNKNOWN', schedule: null }],
  ] as const)('termine sans planning avec l’issue %s', (_status, scheduleResult) => {
    const report = {
      kind: 'RESULT' as const,
      outcome: {
        result: scheduleResult,
        checkedRules: ['UN_SEUL_SHIFT' as const],
        solveSeconds: 30,
      },
    };

    expect(advanceGeneration(queued, report, now)?.outcome?.result).toEqual(scheduleResult);
  });

  it('passe en échec avec le code du moteur', () => {
    const failed = advanceGeneration(queued, { kind: 'FAILED', code: 'INVALID_MODEL' }, now);

    expect(failed).toMatchObject({ status: 'FAILED', failure: 'INVALID_MODEL' });
  });

  it('ne rouvre ni ne remplace une génération terminée', () => {
    const solved = advanceGeneration(queued, result(coherent), now);
    if (solved === undefined) {
      throw new Error('Génération non terminée.');
    }

    expect(advanceGeneration(solved, { kind: 'STARTED' }, now)).toBeUndefined();
    expect(advanceGeneration(solved, { kind: 'FAILED', code: 'PROCESSING_FAILED' }, now)).toBe(
      undefined,
    );
  });
});

describe('Cohérence du planning reçu avec le problème envoyé', () => {
  it('refuse « 2 affectés sur 3 » quand une seule affectation existe', () => {
    const announcedTwo: Schedule = {
      assignments: [{ shiftId: MORNING, employeeId: CAMILLE }],
      shortfalls: coherent.shortfalls,
    };

    expect(() => advanceGeneration(queued, result(announcedTwo), now)).toThrow(
      InconsistentScheduleError,
    );
  });

  const morningShortOne = [
    { shiftId: MORNING, requiredCount: 3, assignedCount: 2 },
    { shiftId: AFTERNOON, requiredCount: 1, assignedCount: 0 },
  ];
  const morningEmpty = [{ shiftId: MORNING, requiredCount: 3, assignedCount: 0 }];

  // Chaque cas annonce des manques conformes à ses affectations : seul le défaut nommé est en cause.
  it.each([
    [
      'une affectation en double',
      [
        { shiftId: MORNING, employeeId: CAMILLE },
        { shiftId: MORNING, employeeId: CAMILLE },
      ],
      morningShortOne,
    ],
    [
      'un shift absent du problème',
      [
        { shiftId: MORNING, employeeId: CAMILLE },
        { shiftId: MORNING, employeeId: SACHA },
        { shiftId: 'inconnu', employeeId: CAMILLE },
      ],
      morningShortOne,
    ],
    [
      'un salarié écarté du calcul',
      [
        { shiftId: MORNING, employeeId: CAMILLE },
        { shiftId: MORNING, employeeId: EXCLUDED },
      ],
      morningShortOne,
    ],
    [
      'plus de personnes que le besoin',
      [
        { shiftId: AFTERNOON, employeeId: CAMILLE },
        { shiftId: AFTERNOON, employeeId: SACHA },
      ],
      morningEmpty,
    ],
  ])('refuse %s', (_case, assignments, shortfalls) => {
    expect(() => advanceGeneration(queued, result({ assignments, shortfalls }), now)).toThrow(
      InconsistentScheduleError,
    );
  });

  it('refuse un manque oublié, inventé ou annoncé deux fois', () => {
    const forgotten = { ...coherent, shortfalls: coherent.shortfalls.slice(0, 1) };
    const invented = {
      ...coherent,
      shortfalls: [
        ...coherent.shortfalls,
        { shiftId: AFTERNOON, requiredCount: 1, assignedCount: 0 },
      ],
    };
    const covered: Schedule = {
      assignments: [...coherent.assignments, { shiftId: AFTERNOON, employeeId: CAMILLE }],
      shortfalls: coherent.shortfalls,
    };

    for (const schedule of [forgotten, invented, covered]) {
      expect(() => advanceGeneration(queued, result(schedule), now)).toThrow(
        InconsistentScheduleError,
      );
    }
  });
});
