import { DefineWeeklyCoverage, GetWeeklyCoverage } from '@trame/api/demand/application';
import {
  InMemorySiteCatalog,
  InMemoryWeeklyCoverageRepository,
} from '@trame/api/demand/application/testing';
import {
  CreateShiftTemplate,
  CreateSite,
  GetShiftTemplateDurations,
} from '@trame/api/organization/application';
import {
  InMemoryShiftTemplateRepository,
  InMemorySiteRepository,
} from '@trame/api/organization/application/testing';
import { GetLatestWeekSchedule, StartScheduleGeneration } from '@trame/api/scheduling/application';
import {
  InMemoryScheduleGenerations,
  InMemoryWeekPlanningSource,
} from '@trame/api/scheduling/application/testing';
import { FixedClock } from '@trame/platform/clock';
import { IdempotencyKey } from '@trame/platform/idempotency';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { PlanningReferenceAdapter } from './planning-reference.adapter';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const MONDAY = Temporal.PlainDate.from('2026-11-23');
const WEDNESDAY = Temporal.PlainDate.from('2026-11-25');
const FORKLIFT = '0190f0a0-0000-7000-8000-0000000000f1';
const CAMILLE = '0190f0a0-0000-7000-8000-0000000000e1';
const YANIS = '0190f0a0-0000-7000-8000-0000000000e2';
const clock = new FixedClock(Temporal.Instant.from('2026-11-15T08:00:00Z'));

async function setUp() {
  const ids = new SequentialIdGenerator();
  const sites = new InMemorySiteRepository();
  const shiftTemplates = new InMemoryShiftTemplateRepository();
  const site = await new CreateSite(sites, clock, ids).execute({
    organizationId: ORGANIZATION_A,
    code: 'DEMO',
    name: 'Entrepôt de démonstration',
    timeZone: 'Europe/Paris',
  });
  // Matin 6 h – 13 h 20, pause de 10 h à 10 h 20.
  const morning = await new CreateShiftTemplate(sites, shiftTemplates, clock, ids).execute({
    organizationId: ORGANIZATION_A,
    siteId: site.id,
    label: 'Matin',
    start: Temporal.PlainTime.from('06:00'),
    end: Temporal.PlainTime.from('13:20'),
    break: { start: Temporal.PlainTime.from('10:00'), durationMinutes: 20 },
  });

  const siteCatalog = new InMemorySiteCatalog();
  siteCatalog.addSite(ORGANIZATION_A, site.id);
  siteCatalog.addShiftTemplate(ORGANIZATION_A, site.id, morning.id);
  siteCatalog.addPosition(ORGANIZATION_A, site.id, FORKLIFT);
  const coverages = new InMemoryWeeklyCoverageRepository();
  await new DefineWeeklyCoverage(siteCatalog, coverages, clock).execute({
    organizationId: ORGANIZATION_A,
    siteId: site.id,
    weekStartsOn: MONDAY,
    needs: [WEDNESDAY, MONDAY].map((date) => ({
      date,
      shiftTemplateId: morning.id,
      positionId: FORKLIFT,
      requiredCount: 1,
    })),
  });

  // Un planning de la semaine où Camille tient le lundi matin, et Yanis le mercredi matin.
  const planning = new InMemoryWeekPlanningSource();
  planning.define(ORGANIZATION_A, {
    siteId: site.id,
    weekStartsOn: MONDAY,
    timeZone: 'Europe/Paris',
    shifts: [MONDAY, WEDNESDAY].map((date) => ({
      date,
      shiftTemplateId: morning.id,
      positionId: FORKLIFT,
      startsAt: date.toZonedDateTime({ timeZone: 'Europe/Paris', plainTime: '06:00' }).toInstant(),
      endsAt: date.toZonedDateTime({ timeZone: 'Europe/Paris', plainTime: '13:20' }).toInstant(),
      effectiveMinutes: 420,
      requiredSkillIds: [],
      requiredCount: 1,
    })),
    employees: [CAMILLE, YANIS].map((id) => ({
      id,
      qualifications: [],
      contracts: [
        { weeklyMinutesMin: 0, weeklyMinutesMax: 2100, startsOn: MONDAY, endsOn: undefined },
      ],
    })),
  });
  const generations = new InMemoryScheduleGenerations();
  const start = new StartScheduleGeneration(generations, planning, clock, ids);

  const adapter = new PlanningReferenceAdapter(
    new GetLatestWeekSchedule(generations),
    new GetShiftTemplateDurations(sites, shiftTemplates),
    new GetWeeklyCoverage(siteCatalog, coverages),
  );

  /** Lance une génération et la termine avec Camille le lundi et Yanis le mercredi. */
  async function solveWeek(key: string): Promise<string> {
    const generation = await start.execute({
      organizationId: ORGANIZATION_A,
      siteId: site.id,
      weekStartsOn: MONDAY,
      key: IdempotencyKey.of(key),
    });
    const [mondayShift, wednesdayShift] = generation.problem.shifts;
    generations.finish(generation.id, {
      status: 'OPTIMAL',
      schedule: {
        assignments: [
          { shiftId: mondayShift?.id ?? '', employeeId: CAMILLE },
          { shiftId: wednesdayShift?.id ?? '', employeeId: YANIS },
        ],
        shortfalls: [],
      },
    });
    return generation.id;
  }

  return { adapter, site, solveWeek };
}

describe('Planning de référence d’une absence, lu dans scheduling, organization et demand', () => {
  it('rend la dernière génération réussie et les shifts du salarié, pause comprise', async () => {
    const { adapter, site, solveWeek } = await setUp();
    const generationId = await solveWeek('first');

    const planning = await adapter.latestPlanningOf(ORGANIZATION_A, site.id, MONDAY, CAMILLE);

    expect(planning?.generationId).toBe(generationId);
    expect(planning?.workedShifts).toHaveLength(1);
    const [monday] = planning?.workedShifts ?? [];
    expect(monday?.startsAt.toString()).toBe('2026-11-23T05:00:00Z');
    expect(monday?.endsAt.toString()).toBe('2026-11-23T12:20:00Z');
    expect(monday?.breaks.map((shiftBreak) => shiftBreak.start.toString())).toEqual([
      '2026-11-23T09:00:00Z',
    ]);
    expect(monday?.breaks.map((shiftBreak) => shiftBreak.end.toString())).toEqual([
      '2026-11-23T09:20:00Z',
    ]);
  });

  it('rend un planning sans shift pour un salarié qui ne travaille pas cette semaine', async () => {
    const { adapter, site, solveWeek } = await setUp();
    await solveWeek('first');
    const absentFromPlanning = '0190f0a0-0000-7000-8000-0000000000e9';

    const planning = await adapter.latestPlanningOf(
      ORGANIZATION_A,
      site.id,
      MONDAY,
      absentFromPlanning,
    );

    expect(planning?.workedShifts).toEqual([]);
  });

  it('ne rend rien tant qu’aucune génération n’a réussi', async () => {
    const { adapter, site } = await setUp();

    expect(
      await adapter.latestPlanningOf(ORGANIZATION_A, site.id, MONDAY, CAMILLE),
    ).toBeUndefined();
  });

  it('rend les jours où le site a des besoins, triés, et aucun pour une semaine sans besoin', async () => {
    const { adapter, site } = await setUp();

    const days = await adapter.activityDaysOf(ORGANIZATION_A, site.id, MONDAY);
    const nextWeek = await adapter.activityDaysOf(
      ORGANIZATION_A,
      site.id,
      MONDAY.add({ weeks: 1 }),
    );

    expect(days.map((day) => day.toString())).toEqual(['2026-11-23', '2026-11-25']);
    expect(nextWeek).toEqual([]);
  });
});
