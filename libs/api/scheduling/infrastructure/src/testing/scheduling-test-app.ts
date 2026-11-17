import type { DynamicModule } from '@nestjs/common';
import { DIAGNOSTIC_PROGRESS } from '../lib/diagnostic-progress.token';
import { Test } from '@nestjs/testing';
import {
  InMemoryDiagnosticRuns,
  InMemoryScheduleGenerations,
  InMemoryWeekPlanningSource,
} from '@trame/api/scheduling/application/testing';
import type { WeekPlanning } from '@trame/api/scheduling/domain';
import { AuthModule, type Actor } from '@trame/platform/auth';
import { testActorResolver } from '@trame/platform/auth/testing';
import { CLOCK, ClockModule, FixedClock } from '@trame/platform/clock';
import { ID_GENERATOR, IdsModule, SequentialIdGenerator } from '@trame/platform/ids';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import { DIAGNOSTIC_RUNS } from '../lib/diagnostic-runs.token';
import {
  SCHEDULE_GENERATION_PROGRESS,
  SCHEDULE_GENERATIONS,
  WEEK_PLANNING_SOURCE,
} from '../lib/generation.tokens';
import { ScheduleGenerationModule } from '../lib/schedule-generation.module';
import { SchedulingModule } from '../lib/scheduling.module';

export const organizationA = '0190f0a0-0000-7000-8000-00000000000a';
export const organizationB = '0190f0a0-0000-7000-8000-00000000000b';
export const manager: Actor = {
  userId: '0190f0a0-0000-7000-8000-0000000000a1',
  organizationId: organizationA,
  roles: ['manager'],
};
export const admin: Actor = { ...manager, roles: ['admin'] };
export const employee: Actor = { ...manager, roles: ['employee'] };
export const otherManager: Actor = { ...manager, organizationId: organizationB };

export async function createSchedulingTestApp() {
  const runs = new InMemoryDiagnosticRuns();
  const moduleRef = await Test.createTestingModule({
    imports: [
      ProblemDetailsModule,
      AuthModule.forRoot({ resolveActor: testActorResolver }),
      ClockModule,
      IdsModule,
      SchedulingModule,
    ],
  })
    .overrideProvider(DIAGNOSTIC_PROGRESS)
    .useValue({ read: async () => undefined, purgeFinishedBefore: async () => 0 })
    .overrideProvider(CLOCK)
    .useValue(new FixedClock('2026-11-04T10:00:00Z'))
    .overrideProvider(ID_GENERATOR)
    .useValue(new SequentialIdGenerator())
    .overrideProvider(DIAGNOSTIC_RUNS)
    .useValue(runs)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  await app.init();
  return { app, runs };
}

/** Semaine du site de A : un shift du lundi matin, deux caristes demandés, un salarié. */
export const SITE_A = '0190f0a0-0000-7000-8000-0000000000d1';
export const EMPTY_SITE_A = '0190f0a0-0000-7000-8000-0000000000d2';
export const TOO_LARGE_SITE_A = '0190f0a0-0000-7000-8000-0000000000d3';
export const GENERATION_MONDAY = Temporal.PlainDate.from('2026-11-23');

function weekOf(siteId: string): WeekPlanning {
  return {
    siteId,
    weekStartsOn: GENERATION_MONDAY,
    timeZone: 'Europe/Paris',
    shifts: [
      {
        date: GENERATION_MONDAY,
        shiftTemplateId: '0190f0a0-0000-7000-8000-000000000011',
        positionId: '0190f0a0-0000-7000-8000-000000000021',
        startsAt: Temporal.Instant.from('2026-11-23T05:00:00Z'),
        endsAt: Temporal.Instant.from('2026-11-23T12:20:00Z'),
        effectiveMinutes: 420,
        requiredSkillIds: [],
        requiredCount: 2,
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
}

/** 2 000 shifts de 20 compétences : conforme au contrat, plus de 1 Mio une fois publié. */
function tooLargeWeek(): WeekPlanning {
  const week = weekOf(TOO_LARGE_SITE_A);
  const [shift] = week.shifts;
  if (shift === undefined) {
    throw new Error('Semaine sans shift.');
  }
  const skills = Array.from(
    { length: 20 },
    (_, index) => `0190f0a0-0000-7000-8000-${String(index).padStart(12, '0')}`,
  );
  const shifts = Array.from({ length: 2_000 }, (_, index) => ({
    ...shift,
    positionId: `0190f0a0-0000-7000-8000-${String(index).padStart(12, '0')}`,
    requiredSkillIds: skills,
  }));
  return { ...week, shifts };
}

export async function createScheduleGenerationTestApp() {
  const clock = new FixedClock('2026-11-17T10:00:00Z');
  const generations = new InMemoryScheduleGenerations();
  const planning = new InMemoryWeekPlanningSource();
  planning.define(organizationA, weekOf(SITE_A));
  planning.define(organizationA, { ...weekOf(EMPTY_SITE_A), shifts: [] });
  planning.define(organizationA, tooLargeWeek());
  const weekPlanning: DynamicModule = {
    module: class TestWeekPlanningModule {},
    providers: [{ provide: WEEK_PLANNING_SOURCE, useValue: planning }],
    exports: [WEEK_PLANNING_SOURCE],
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      ProblemDetailsModule,
      AuthModule.forRoot({ resolveActor: testActorResolver }),
      ClockModule,
      IdsModule,
      ScheduleGenerationModule.forRoot({ weekPlanning }),
    ],
  })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(ID_GENERATOR)
    .useValue(new SequentialIdGenerator())
    .overrideProvider(SCHEDULE_GENERATIONS)
    .useValue(generations)
    .overrideProvider(SCHEDULE_GENERATION_PROGRESS)
    .useValue(generations)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  await app.init();
  return { app, clock, generations };
}
