import { hasSchedule, isSameWeek, type ScheduleGeneration } from './schedule-generation';

const MONDAY = Temporal.PlainDate.from('2026-11-23');
const SITE_ID = '0190f0a0-0000-7000-8000-0000000000d1';
const schedule = { assignments: [], shortfalls: [] };

const queued: ScheduleGeneration = {
  id: '0190f0a0-0000-7000-8000-0000000000e1',
  organizationId: '0190f0a0-0000-7000-8000-00000000000a',
  siteId: SITE_ID,
  weekStartsOn: MONDAY,
  status: 'QUEUED',
  problem: {
    weekStartsOn: '2026-11-23',
    timeZone: 'Europe/Paris',
    shifts: [],
    employees: [],
    rules: [{ id: 'UN_SEUL_SHIFT' }],
    objective: { mode: 'STANDARD' },
  },
  parameters: { timeLimitSeconds: 30, workers: 1, seed: 0 },
  excludedEmployees: [],
  createdAt: Temporal.Instant.from('2026-11-16T21:00:00Z'),
};

function finished(
  result: NonNullable<ScheduleGeneration['outcome']>['result'],
): ScheduleGeneration {
  return {
    ...queued,
    status: 'SUCCEEDED',
    outcome: { result, checkedRules: ['UN_SEUL_SHIFT'], solveSeconds: 0.2 },
  };
}

describe('Planning exploitable d’une génération', () => {
  it.each([
    ['OPTIMAL', finished({ status: 'OPTIMAL', schedule })],
    ['FEASIBLE', finished({ status: 'FEASIBLE', schedule })],
  ])('en a un avec l’issue %s', (_status, generation) => {
    expect(hasSchedule(generation)).toBe(true);
  });

  it.each([
    ['en attente', queued],
    ['en cours', { ...queued, status: 'RUNNING' as const }],
    ['sans planning légal', finished({ status: 'INFEASIBLE', schedule: null })],
    ['sans solution dans le délai', finished({ status: 'UNKNOWN', schedule: null })],
    ['annulée, même avec un planning partiel', finished({ status: 'CANCELLED', schedule })],
    ['en échec', { ...queued, status: 'FAILED' as const, failure: 'INVALID_MODEL' as const }],
  ])('n’en a pas %s', (_situation, generation) => {
    expect(hasSchedule(generation)).toBe(false);
  });
});

describe('Même semaine qu’une génération', () => {
  it('reconnaît le même site et le même lundi', () => {
    expect(isSameWeek(queued, SITE_ID, Temporal.PlainDate.from('2026-11-23'))).toBe(true);
  });

  it('distingue un autre site ou une autre semaine', () => {
    expect(isSameWeek(queued, '0190f0a0-0000-7000-8000-0000000000d2', MONDAY)).toBe(false);
    expect(isSameWeek(queued, SITE_ID, MONDAY.add({ weeks: 1 }))).toBe(false);
  });
});
