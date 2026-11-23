import { PrismaService } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import {
  IdempotencyKeyReusedError,
  ScheduleRequestTooLargeError,
  StartScheduleGeneration,
} from '@trame/api/scheduling/application';
import { InMemoryWeekPlanningSource } from '@trame/api/scheduling/application/testing';
import type { WeekPlanning } from '@trame/api/scheduling/domain';
import { FixedClock } from '@trame/platform/clock';
import { IdempotencyKey } from '@trame/platform/idempotency';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { scheduleRequestedV1 } from '@trame/shared/contracts';
import { PrismaScheduleGenerations } from './prisma-schedule-generations';

const organizationId = '0190f0a0-0000-7000-8000-00000000000a';
const anotherOrganizationId = '0190f0a0-0000-7000-8000-00000000000b';
const SITE_ID = '0190f0a0-0000-7000-8000-0000000000d1';
const MONDAY = Temporal.PlainDate.from('2026-11-23');
const CACES_3 = '0190f0a0-0000-7000-8000-000000000031';
const clock = new FixedClock('2026-11-16T21:00:00.123Z');

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
      requiredSkillIds: [CACES_3],
      requiredCount: 2,
    },
  ],
  employees: [
    {
      id: '0190f0a0-0000-7000-8000-000000000041',
      qualifications: [{ skillId: CACES_3, expiresOn: Temporal.PlainDate.from('2026-11-25') }],
      contracts: [
        {
          weeklyMinutesMin: 0,
          weeklyMinutesMax: 2100,
          startsOn: Temporal.PlainDate.from('2026-01-05'),
          endsOn: undefined,
        },
      ],
    },
    { id: '0190f0a0-0000-7000-8000-000000000049', qualifications: [], contracts: [] },
  ],
  absences: [],
  absenceValuations: [],
  employeesWithAbsenceToDefine: [],
};

describe('Enregistrement des générations (PostgreSQL)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let generations: PrismaScheduleGenerations;
  let start: StartScheduleGeneration;
  let ids: SequentialIdGenerator;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
    generations = new PrismaScheduleGenerations(prisma);
  });
  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany();
    await prisma.scheduleGenerationEvent.deleteMany();
    await prisma.scheduleGeneration.deleteMany();
    const source = new InMemoryWeekPlanningSource();
    source.define(organizationId, planning);
    source.define(anotherOrganizationId, planning);
    ids = new SequentialIdGenerator();
    start = new StartScheduleGeneration(generations, source, clock, ids);
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  function launch(key: string, weekStartsOn = MONDAY, organization = organizationId) {
    return start.execute({
      organizationId: organization,
      siteId: SITE_ID,
      weekStartsOn,
      key: IdempotencyKey.of(key),
    });
  }

  it('conserve la génération, son instantané et une demande conforme au contrat', async () => {
    const generation = await launch('new-request');

    expect(await generations.findById(organizationId, generation.id)).toEqual(generation);
    const messages = await prisma.outboxMessage.findMany({ where: { organizationId } });
    expect(messages).toHaveLength(1);
    const message = scheduleRequestedV1.parse(messages[0]?.body);
    expect(message.payload).toEqual({
      generationId: generation.id,
      problem: generation.problem,
      parameters: { timeLimitSeconds: 30, workers: 1, seed: 0 },
    });
    expect(generation.excludedEmployees).toEqual([
      { employeeId: '0190f0a0-0000-7000-8000-000000000049', reason: 'NO_CONTRACT_COVERING_WEEK' },
    ]);
  });

  it('conserve les valorisations d’absence de la génération (US-033)', async () => {
    const withAbsence = {
      ...planning,
      absenceValuations: [
        {
          employeeId: '0190f0a0-0000-7000-8000-000000000041',
          absenceMinutes: 280,
          method: 'EQUAL_SHARE_OF_ACTIVITY_DAYS' as const,
          weeklyMinimumMinutes: 1680,
          activityDays: [
            '2026-11-23',
            '2026-11-24',
            '2026-11-25',
            '2026-11-26',
            '2026-11-27',
            '2026-11-28',
          ],
          dailyShareMinutes: 280,
        },
      ],
    };
    const source = new InMemoryWeekPlanningSource();
    source.define(organizationId, withAbsence);
    start = new StartScheduleGeneration(generations, source, clock, ids);

    const generation = await launch('with-absence');

    expect(generation.absenceValuations).toEqual(withAbsence.absenceValuations);
    expect(await generations.findById(organizationId, generation.id)).toEqual(generation);
  });

  it('relit une génération enregistrée avant US-033 sans valorisation d’absence', async () => {
    const generation = await launch('before-us-033');
    await prisma.$executeRaw`
      UPDATE scheduling.schedule_generations SET absence_valuations = DEFAULT WHERE id = ${generation.id}::uuid
    `;

    expect((await generations.findById(organizationId, generation.id))?.absenceValuations).toEqual(
      [],
    );
  });

  it('Double clic simultané : une seule génération et un seul message', async () => {
    const [first, second] = await Promise.all([launch('same-key'), launch('same-key')]);

    expect(second.id).toBe(first.id);
    expect(await prisma.scheduleGeneration.count()).toBe(1);
    expect(await prisma.outboxMessage.count()).toBe(1);
  });

  it('la même clé pour une autre semaine est refusée, sans rien écrire', async () => {
    await launch('same-key');

    await expect(launch('same-key', MONDAY.add({ weeks: 1 }))).rejects.toThrow(
      IdempotencyKeyReusedError,
    );
    expect(await prisma.scheduleGeneration.count()).toBe(1);
    expect(await prisma.outboxMessage.count()).toBe(1);
  });

  it('Isolation : une autre organisation ne lit ni la génération ni sa semaine', async () => {
    const generation = await launch('request-1');

    expect(await generations.findById(anotherOrganizationId, generation.id)).toBeUndefined();
    expect(
      (await generations.latestOfWeek(anotherOrganizationId, SITE_ID, MONDAY)).latestAttempt,
    ).toBeUndefined();
  });

  it('garde le dernier planning exploitable pendant qu’un nouveau calcul tourne', async () => {
    const solved = await launch('first');
    await prisma.scheduleGeneration.update({
      where: { id: solved.id },
      data: {
        status: 'SUCCEEDED',
        outcome: {
          result: { status: 'FEASIBLE', schedule: { assignments: [], shortfalls: [] } },
          checkedRules: ['UN_SEUL_SHIFT'],
          solveSeconds: 0.3,
        },
        finishedAt: new Date('2026-11-16T21:00:05Z'),
      },
    });
    // Même générateur d'identifiants : une seconde génération, cinq minutes plus tard.
    const later = new FixedClock('2026-11-16T21:05:00Z');
    const impossible = await new StartScheduleGeneration(
      generations,
      sourceFor(organizationId),
      later,
      ids,
    ).execute({
      organizationId,
      siteId: SITE_ID,
      weekStartsOn: MONDAY,
      key: IdempotencyKey.of('second'),
    });
    await prisma.scheduleGeneration.update({
      where: { id: impossible.id },
      data: {
        status: 'SUCCEEDED',
        outcome: {
          result: { status: 'INFEASIBLE', schedule: null },
          checkedRules: ['UN_SEUL_SHIFT'],
          solveSeconds: 0.2,
        },
      },
    });

    expect(
      (await generations.latestOfWeek(organizationId, SITE_ID, MONDAY)).latestAttempt?.id,
    ).toBe(impossible.id);
    expect(
      (await generations.latestOfWeek(organizationId, SITE_ID, MONDAY)).latestSchedule?.id,
    ).toBe(solved.id);
  });

  it('une demande au-delà de 1 Mio ne crée ni génération ni message', async () => {
    const [shift] = planning.shifts;
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
    const source = new InMemoryWeekPlanningSource();
    source.define(organizationId, { ...planning, shifts });
    const tooLarge = new StartScheduleGeneration(generations, source, clock, ids);

    await expect(
      tooLarge.execute({
        organizationId,
        siteId: SITE_ID,
        weekStartsOn: MONDAY,
        key: IdempotencyKey.of('too-large'),
      }),
    ).rejects.toThrow(ScheduleRequestTooLargeError);
    expect(await prisma.scheduleGeneration.count()).toBe(0);
    expect(await prisma.outboxMessage.count()).toBe(0);
  });

  it('supprime les événements de progression avec leur génération', async () => {
    const generation = await launch('request-1');
    await prisma.scheduleGenerationEvent.create({
      data: {
        id: '0190f0a0-0000-7000-8000-0000000000f1',
        organizationId,
        generationId: generation.id,
        sequence: 1,
        status: 'RUNNING',
        occurredAt: new Date('2026-11-16T21:00:01Z'),
      },
    });

    await prisma.scheduleGeneration.delete({ where: { id: generation.id } });

    expect(await prisma.scheduleGenerationEvent.count()).toBe(0);
  });

  it('refuse en base une semaine qui ne commence pas un lundi', async () => {
    const generation = await launch('request-1');

    await expect(
      prisma.scheduleGeneration.update({
        where: { id: generation.id },
        data: { weekStartsOn: new Date('2026-11-24') },
      }),
    ).rejects.toThrow();
  });
});

function sourceFor(organization: string): InMemoryWeekPlanningSource {
  const source = new InMemoryWeekPlanningSource();
  source.define(organization, planning);
  return source;
}
