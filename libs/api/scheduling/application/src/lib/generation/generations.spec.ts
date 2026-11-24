import {
  NoCoverageNeedError,
  WeekMustStartOnMondayError,
  type ScheduleGeneration,
  type WeekPlanning,
} from '@trame/api/scheduling/domain';
import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { IdempotencyKey } from '@trame/platform/idempotency';
import { scheduleRequestedV1 } from '@trame/shared/contracts';
import { InMemoryScheduleGenerations, InMemoryWeekPlanningSource } from '../../testing';
import {
  IdempotencyKeyReusedError,
  ScheduleGenerationNotFoundError,
  ScheduleRequestTooLargeError,
  SiteNotFoundError,
} from './generation.errors';
import { GetLatestWeekSchedule } from './get-latest-week-schedule';
import { GetScheduleGeneration } from './get-schedule-generation';
import { GetWeekScheduleGenerations } from './get-week-schedule-generations';
import { StartScheduleGeneration } from './start-schedule-generation';

const organizationId = '0190f0a0-0000-7000-8000-00000000000a';
const anotherOrganizationId = '0190f0a0-0000-7000-8000-00000000000b';
const SITE_ID = '0190f0a0-0000-7000-8000-0000000000d1';
const OTHER_SITE_ID = '0190f0a0-0000-7000-8000-0000000000d2';
const MONDAY = Temporal.PlainDate.from('2026-11-23');
const CACES_3 = '0190f0a0-0000-7000-8000-000000000031';
const clock = new FixedClock('2026-11-16T21:00:00Z');

function weekPlanning(siteId: string, requiredCount = 2): WeekPlanning {
  return {
    siteId,
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
        requiredCount,
      },
    ],
    employees: [
      {
        id: '0190f0a0-0000-7000-8000-000000000041',
        qualifications: [{ skillId: CACES_3, expiresOn: undefined }],
        contracts: [
          {
            weeklyMinutesMin: 0,
            weeklyMinutesMax: 2100,
            startsOn: Temporal.PlainDate.from('2026-01-05'),
            endsOn: undefined,
          },
        ],
      },
      {
        id: '0190f0a0-0000-7000-8000-000000000049',
        qualifications: [],
        contracts: [],
      },
    ],
    absences: [],
    absenceValuations: [],
    employeesWithAbsenceToDefine: [],
  };
}

const CAMILLE = '0190f0a0-0000-7000-8000-000000000041';

/** Camille absente le lundi entier, valorisée 7 h sur la génération de référence. */
const CAMILLE_ABSENT_ON_MONDAY = {
  absences: [
    {
      employeeId: CAMILLE,
      startsAt: Temporal.Instant.from('2026-11-22T23:00:00Z'),
      endsAt: Temporal.Instant.from('2026-11-23T23:00:00Z'),
    },
  ],
  absenceValuations: [
    {
      employeeId: CAMILLE,
      absenceMinutes: 420,
      method: 'REFERENCE_PLANNING' as const,
      referenceGenerationId: '0190f0a0-0000-7000-8000-0000000000e0',
    },
  ],
};

describe('Lancer la génération du planning d’une semaine', () => {
  let generations: InMemoryScheduleGenerations;
  let planning: InMemoryWeekPlanningSource;
  let start: StartScheduleGeneration;

  beforeEach(() => {
    generations = new InMemoryScheduleGenerations();
    planning = new InMemoryWeekPlanningSource();
    planning.define(organizationId, weekPlanning(SITE_ID));
    planning.define(organizationId, weekPlanning(OTHER_SITE_ID));
    planning.define(anotherOrganizationId, weekPlanning(SITE_ID));
    start = new StartScheduleGeneration(generations, planning, clock, new SequentialIdGenerator());
  });

  function launch(key: string, siteId = SITE_ID, weekStartsOn = MONDAY) {
    return start.execute({ organizationId, siteId, weekStartsOn, key: IdempotencyKey.of(key) });
  }

  it('enregistre une génération en attente, son instantané et un seul message pour le moteur', async () => {
    const generation = await launch('request-1');

    expect(generation).toMatchObject({
      organizationId,
      siteId: SITE_ID,
      status: 'QUEUED',
      parameters: { timeLimitSeconds: 30, workers: 1, seed: 0 },
      excludedEmployees: [
        { employeeId: '0190f0a0-0000-7000-8000-000000000049', reason: 'NO_CONTRACT_COVERING_WEEK' },
      ],
      createdAt: clock.now(),
    });
    expect(generation.weekStartsOn.equals(MONDAY)).toBe(true);
    expect(generation.problem.shifts[0]?.requiredCount).toBe(2);
    const messages = generations.messages();
    expect(messages).toHaveLength(1);
    const message = scheduleRequestedV1.parse(messages[0]);
    expect(message).toMatchObject({
      organizationId,
      type: 'scheduling.schedule-requested.v1',
      payload: { generationId: generation.id, parameters: generation.parameters },
    });
    expect(message.payload.problem).toEqual(generation.problem);
  });

  it('BDD : garde avec la génération les absences envoyées au moteur et leurs valorisations', async () => {
    planning.define(organizationId, { ...weekPlanning(SITE_ID), ...CAMILLE_ABSENT_ON_MONDAY });

    const generation = await launch('request-1');

    expect(generation.problem.employees[0]).toMatchObject({
      id: CAMILLE,
      unavailabilities: [
        { startsAt: '2026-11-23T00:00:00+01:00', endsAt: '2026-11-24T00:00:00+01:00' },
      ],
      contract: { absenceMinutes: 420 },
    });
    expect(generation.absenceValuations).toEqual(CAMILLE_ABSENT_ON_MONDAY.absenceValuations);
    const message = scheduleRequestedV1.parse(generations.messages()[0]);
    expect(message.payload.problem.rules).toContainEqual({ id: 'INDISPONIBILITE' });
  });

  it('BDD : écarte un salarié dont l’absence attend sa valorisation', async () => {
    planning.define(organizationId, {
      ...weekPlanning(SITE_ID),
      employeesWithAbsenceToDefine: [CAMILLE],
    });

    const generation = await launch('request-1');

    expect(generation.excludedEmployees).toContainEqual({
      employeeId: CAMILLE,
      reason: 'ABSENCE_VALUATION_TO_DEFINE',
    });
    expect(generation.problem.employees).toEqual([]);
  });

  it('Double clic : la même clé rend la génération d’origine, même si les besoins ont changé', async () => {
    const first = await launch('same-request');
    planning.define(organizationId, weekPlanning(SITE_ID, 5));

    const replay = await launch('same-request');

    expect(replay).toEqual(first);
    expect(replay.problem.shifts[0]?.requiredCount).toBe(2);
    expect(generations.messages()).toHaveLength(1);
  });

  it('refuse la même clé pour un autre site ou une autre semaine, sans rien créer', async () => {
    await launch('same-key');

    await expect(launch('same-key', OTHER_SITE_ID)).rejects.toThrow(IdempotencyKeyReusedError);
    await expect(launch('same-key', SITE_ID, MONDAY.add({ weeks: 1 }))).rejects.toThrow(
      IdempotencyKeyReusedError,
    );
    expect(generations.messages()).toHaveLength(1);
  });

  it('sépare les organisations qui utilisent la même clé', async () => {
    const first = await launch('same-key');
    const second = await start.execute({
      organizationId: anotherOrganizationId,
      siteId: SITE_ID,
      weekStartsOn: MONDAY,
      key: IdempotencyKey.of('same-key'),
    });

    expect(second.id).not.toBe(first.id);
    expect(second.organizationId).toBe(anotherOrganizationId);
  });

  it('ne lance rien sur le site d’une autre organisation', async () => {
    planning.forget(organizationId, SITE_ID);

    await expect(launch('request-1')).rejects.toThrow(SiteNotFoundError);
    expect(generations.messages()).toHaveLength(0);
  });

  it('Semaine sans besoin : refusée, aucune génération créée', async () => {
    planning.define(organizationId, { ...weekPlanning(SITE_ID), shifts: [] });

    await expect(launch('request-1')).rejects.toThrow(NoCoverageNeedError);
    expect(generations.messages()).toHaveLength(0);
  });

  it('refuse une demande au-delà de 1 Mio, sans génération ni message', async () => {
    // 2 000 shifts de 20 compétences : conforme au contrat, mais plus de 2 Mio une fois publié.
    const [shift] = weekPlanning(SITE_ID).shifts;
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
    planning.define(organizationId, { ...weekPlanning(SITE_ID), shifts });

    await expect(launch('too-large')).rejects.toThrow(ScheduleRequestTooLargeError);
    expect(generations.messages()).toHaveLength(0);
    expect(await generations.findByKey(organizationId, IdempotencyKey.of('too-large'))).toBe(
      undefined,
    );
  });

  it('Semaine qui ne commence pas un lundi : refusée', async () => {
    await expect(launch('request-1', SITE_ID, MONDAY.add({ days: 1 }))).rejects.toThrow(
      WeekMustStartOnMondayError,
    );
  });
});

describe('Retrouver les générations', () => {
  let generations: InMemoryScheduleGenerations;
  let planning: InMemoryWeekPlanningSource;
  let ids: SequentialIdGenerator;

  beforeEach(() => {
    generations = new InMemoryScheduleGenerations();
    planning = new InMemoryWeekPlanningSource();
    planning.define(organizationId, weekPlanning(SITE_ID));
    ids = new SequentialIdGenerator();
  });

  async function generation(key: string, minutesLater: number): Promise<ScheduleGeneration> {
    const later = new FixedClock(clock.now().add({ minutes: minutesLater }).toString());
    const start = new StartScheduleGeneration(generations, planning, later, ids);
    return start.execute({
      organizationId,
      siteId: SITE_ID,
      weekStartsOn: MONDAY,
      key: IdempotencyKey.of(key),
    });
  }

  it('Isolation : une autre organisation ne trouve pas la génération', async () => {
    const launched = await generation('request-1', 0);
    const get = new GetScheduleGeneration(generations);

    expect(await get.execute({ organizationId, generationId: launched.id })).toEqual(launched);
    await expect(
      get.execute({ organizationId: anotherOrganizationId, generationId: launched.id }),
    ).rejects.toThrow(ScheduleGenerationNotFoundError);
  });

  it('garde le dernier planning exploitable pendant qu’un nouveau calcul tourne', async () => {
    const solved = await generation('first', 0);
    generations.finish(solved.id, {
      status: 'FEASIBLE',
      schedule: { assignments: [], shortfalls: [] },
    });
    const running = await generation('second', 5);
    generations.start(running.id);

    const week = await new GetWeekScheduleGenerations(generations, planning).execute({
      organizationId,
      siteId: SITE_ID,
      weekStartsOn: MONDAY,
    });

    expect(week.latestAttempt?.id).toBe(running.id);
    expect(week.latestAttempt?.status).toBe('RUNNING');
    expect(week.latestSchedule?.id).toBe(solved.id);
  });

  it('ne prend pas un calcul sans planning pour le dernier planning exploitable', async () => {
    const solved = await generation('first', 0);
    generations.finish(solved.id, {
      status: 'OPTIMAL',
      schedule: { assignments: [], shortfalls: [] },
    });
    const impossible = await generation('second', 5);
    generations.finish(impossible.id, { status: 'INFEASIBLE', schedule: null });

    const week = await new GetWeekScheduleGenerations(generations, planning).execute({
      organizationId,
      siteId: SITE_ID,
      weekStartsOn: MONDAY,
    });

    expect(week.latestAttempt?.id).toBe(impossible.id);
    expect(week.latestSchedule?.id).toBe(solved.id);
  });

  it('lit le dernier essai et le dernier planning dans un même état de la base', async () => {
    const racing = new FinishingDuringRead();
    const start = new StartScheduleGeneration(racing, planning, clock, ids);
    const running = await start.execute({
      organizationId,
      siteId: SITE_ID,
      weekStartsOn: MONDAY,
      key: IdempotencyKey.of('running'),
    });
    racing.start(running.id);
    racing.finishOnRead = running.id;

    const week = await new GetWeekScheduleGenerations(racing, planning).execute({
      organizationId,
      siteId: SITE_ID,
      weekStartsOn: MONDAY,
    });

    // Avant ou après la fin du calcul, mais jamais les deux à la fois.
    const sameState =
      week.latestSchedule === undefined || week.latestAttempt?.status === 'SUCCEEDED';
    expect(sameState).toBe(true);
  });

  describe('dernier planning d’une semaine, pour les autres contextes (US-033)', () => {
    it('rend la dernière génération terminée avec un planning, pas celle qui tourne encore', async () => {
      const solved = await generation('solved', 0);
      generations.finish(solved.id, {
        status: 'FEASIBLE',
        schedule: { assignments: [], shortfalls: [] },
      });
      const running = await generation('running', 5);
      generations.start(running.id);

      const latest = await new GetLatestWeekSchedule(generations).execute({
        organizationId,
        siteId: SITE_ID,
        weekStartsOn: MONDAY,
      });

      expect(latest?.id).toBe(solved.id);
    });

    it('ne rend rien sans planning, ni pour une autre organisation', async () => {
      const impossible = await generation('impossible', 0);
      generations.finish(impossible.id, { status: 'INFEASIBLE', schedule: null });
      const getLatest = new GetLatestWeekSchedule(generations);

      expect(
        await getLatest.execute({ organizationId, siteId: SITE_ID, weekStartsOn: MONDAY }),
      ).toBeUndefined();
      expect(
        await getLatest.execute({
          organizationId: anotherOrganizationId,
          siteId: SITE_ID,
          weekStartsOn: MONDAY,
        }),
      ).toBeUndefined();
    });
  });

  it('rend une semaine vide sans génération, et refuse le site d’une autre organisation', async () => {
    const getWeek = new GetWeekScheduleGenerations(generations, planning);
    const query = { organizationId, siteId: SITE_ID, weekStartsOn: MONDAY };

    expect(await getWeek.execute(query)).toEqual({
      latestAttempt: undefined,
      latestSchedule: undefined,
    });
    await expect(
      getWeek.execute({ ...query, organizationId: anotherOrganizationId }),
    ).rejects.toThrow(SiteNotFoundError);
    await expect(
      getWeek.execute({ ...query, weekStartsOn: MONDAY.add({ days: 2 }) }),
    ).rejects.toThrow(WeekMustStartOnMondayError);
  });
});

/** Un calcul se termine pendant la lecture d'une semaine : la lecture doit rester cohérente. */
class FinishingDuringRead extends InMemoryScheduleGenerations {
  finishOnRead: string | undefined;

  override async latestOfWeek(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<WeekScheduleGenerations> {
    const week = await super.latestOfWeek(organizationId, siteId, weekStartsOn);
    this.finishPending();
    return week;
  }

  private finishPending(): void {
    if (this.finishOnRead !== undefined) {
      this.finish(this.finishOnRead, {
        status: 'OPTIMAL',
        schedule: { assignments: [], shortfalls: [] },
      });
      this.finishOnRead = undefined;
    }
  }
}
