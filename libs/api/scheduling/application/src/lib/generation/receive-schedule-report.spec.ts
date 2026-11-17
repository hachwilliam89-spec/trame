import { InconsistentScheduleError, type WeekPlanning } from '@trame/api/scheduling/domain';
import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { IdempotencyKey } from '@trame/platform/idempotency';
import type { ScheduleReportedV1, ScheduleReportV1 } from '@trame/shared/contracts';
import { InMemoryScheduleGenerations, InMemoryWeekPlanningSource } from '../../testing';
import { ReceiveScheduleReport, UnmatchedScheduleReportError } from './receive-schedule-report';
import { StartScheduleGeneration } from './start-schedule-generation';

const organizationId = '0190f0a0-0000-7000-8000-00000000000a';
const SITE_ID = '0190f0a0-0000-7000-8000-0000000000d1';
const MONDAY = Temporal.PlainDate.from('2026-11-23');
const clock = new FixedClock('2026-11-16T21:00:00Z');

const planning: WeekPlanning = {
  siteId: SITE_ID,
  weekStartsOn: MONDAY,
  timeZone: 'Europe/Paris',
  shifts: [
    {
      date: MONDAY,
      shiftTemplateId: '0190f0a0-0000-7000-8000-000000000011',
      positionId: '0190f0a0-0000-7000-8000-000000000021',
      startsAt: Temporal.Instant.from('2026-11-23T05:00:00Z'),
      endsAt: Temporal.Instant.from('2026-11-23T12:20:00Z'),
      effectiveMinutes: 420,
      requiredSkillIds: [],
      requiredCount: 3,
    },
  ],
  employees: [
    {
      id: '0190f0a0-0000-7000-8000-000000000041',
      qualifications: [],
      contracts: [
        {
          weeklyMinutesMin: 0,
          weeklyMinutesMax: 2100,
          startsOn: Temporal.PlainDate.from('2026-01-05'),
          endsOn: undefined,
        },
      ],
    },
  ],
};

describe('Recevoir le rapport d’une génération', () => {
  let generations: InMemoryScheduleGenerations;
  let receive: ReceiveScheduleReport;

  beforeEach(() => {
    generations = new InMemoryScheduleGenerations();
    receive = new ReceiveScheduleReport(generations, clock);
  });

  async function launched() {
    const source = new InMemoryWeekPlanningSource();
    source.define(organizationId, planning);
    const start = new StartScheduleGeneration(
      generations,
      source,
      clock,
      new SequentialIdGenerator(),
    );
    const generation = await start.execute({
      organizationId,
      siteId: SITE_ID,
      weekStartsOn: MONDAY,
      key: IdempotencyKey.of('request-1'),
    });
    const [request] = generations.messages();
    return { generation, requestId: request?.id ?? '' };
  }

  function reported(generationId: string, requestId: string, report: ScheduleReportV1) {
    const message: ScheduleReportedV1 = {
      id: '0190f0a0-0000-7000-8000-0000000000f1',
      organizationId,
      type: 'scheduling.schedule-reported.v1',
      occurredAt: '2026-11-16T21:00:01Z',
      payload: { generationId, requestId, report },
    };
    return message;
  }

  it('termine la génération avec un planning cohérent et ses manques', async () => {
    const { generation, requestId } = await launched();
    const shiftId = generation.problem.shifts[0]?.id ?? '';
    const employeeId = generation.problem.employees[0]?.id ?? '';

    await receive.execute(
      reported(generation.id, requestId, {
        kind: 'RESULT',
        outcome: {
          result: {
            status: 'OPTIMAL',
            schedule: {
              assignments: [{ shiftId, employeeId }],
              shortfalls: [{ shiftId, requiredCount: 3, assignedCount: 1 }],
            },
          },
          checkedRules: ['HABILITATION_REQUISE'],
          solveSeconds: 0.2,
        },
      }),
    );

    const stored = await generations.findById(organizationId, generation.id);
    expect(stored?.status).toBe('SUCCEEDED');
    expect(stored?.outcome?.result.status).toBe('OPTIMAL');
  });

  it('refuse un rapport incohérent, sans toucher à la génération', async () => {
    const { generation, requestId } = await launched();
    const shiftId = generation.problem.shifts[0]?.id ?? '';
    const employeeId = generation.problem.employees[0]?.id ?? '';
    const twoAnnouncedForOne: ScheduleReportV1 = {
      kind: 'RESULT',
      outcome: {
        result: {
          status: 'FEASIBLE',
          schedule: {
            assignments: [{ shiftId, employeeId }],
            shortfalls: [{ shiftId, requiredCount: 3, assignedCount: 2 }],
          },
        },
        checkedRules: ['HABILITATION_REQUISE'],
        solveSeconds: 0.2,
      },
    };

    await expect(
      receive.execute(reported(generation.id, requestId, twoAnnouncedForOne)),
    ).rejects.toThrow(InconsistentScheduleError);
    expect((await generations.findById(organizationId, generation.id))?.status).toBe('QUEUED');
  });

  it('refuse un rapport qui ne répond à aucune demande', async () => {
    const { generation } = await launched();

    await expect(
      receive.execute(
        reported(generation.id, '0190f0a0-0000-7000-8000-0000000000ff', { kind: 'STARTED' }),
      ),
    ).rejects.toThrow(UnmatchedScheduleReportError);
  });
});
