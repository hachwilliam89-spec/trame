import { PrismaDatabase, PrismaService } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { anEmployee } from '@trame/api/staff/application/testing';
import {
  Absence,
  type AbsenceWeekReference,
  EqualShareReference,
  PlanningReference,
} from '@trame/api/staff/domain';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { PrismaAbsenceWeekReferenceRepository } from './prisma-absence-week-reference.repository';
import { PrismaAbsenceRepository } from './prisma-absence.repository';
import { PrismaEmployeeRepository } from './prisma-employee.repository';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const DEMO_SITE = '0190f0a0-0000-7000-8000-0000000000d1';
const OTHER_SITE = '0190f0a0-0000-7000-8000-0000000000d2';
const MONDAY = Temporal.PlainDate.from('2026-11-23');
const FROZEN_AT = Temporal.Instant.from('2026-11-18T15:00:00.123Z');
const GENERATION = '0190f0a0-0000-7000-8000-000000000a01';
const LATER_GENERATION = '0190f0a0-0000-7000-8000-000000000a02';

function parisInstant(localDateTime: string): Temporal.Instant {
  return Temporal.Instant.from(`${localDateTime}+01:00`);
}

describe('références de valorisation des absences sur PostgreSQL (US-033)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let absences: PrismaAbsenceRepository;
  let references: PrismaAbsenceWeekReferenceRepository;
  let ids: SequentialIdGenerator;
  let camille: string;
  let employeeAtOtherSite: string;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
    absences = new PrismaAbsenceRepository(new PrismaDatabase(prisma));
    references = new PrismaAbsenceWeekReferenceRepository(new PrismaDatabase(prisma));
  }, 120_000);

  beforeEach(async () => {
    // Cette base est propre au fichier ; les autres suites ont leur propre base migrée.
    await prisma.absenceWeekReference.deleteMany();
    await prisma.absence.deleteMany();
    await prisma.employeeQualification.deleteMany();
    await prisma.employee.deleteMany();
    ids = new SequentialIdGenerator();
    camille = ids.next();
    employeeAtOtherSite = ids.next();
    const employees = new PrismaEmployeeRepository(new PrismaDatabase(prisma));
    await employees.add(anEmployee().withId(camille).atSite(DEMO_SITE).build());
    await employees.add(anEmployee().withId(employeeAtOtherSite).atSite(OTHER_SITE).build());
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  function tuesdayOf(employeeId: string): Absence {
    return Absence.create({
      id: ids.next(),
      organizationId: ORGANIZATION_A,
      employeeId,
      startsAt: parisInstant('2026-11-24T00:00'),
      endsAt: parisInstant('2026-11-25T00:00'),
      reason: 'LEAVE',
      createdAt: FROZEN_AT,
    });
  }

  function planningReferenceOf(employeeId: string, generationId = GENERATION): PlanningReference {
    return PlanningReference.freeze({
      organizationId: ORGANIZATION_A,
      employeeId,
      weekStartsOn: MONDAY,
      frozenAt: FROZEN_AT,
      generationId,
      workedShifts: [
        {
          startsAt: parisInstant('2026-11-24T06:00'),
          endsAt: parisInstant('2026-11-24T13:20'),
          breaks: [
            { start: parisInstant('2026-11-24T10:00'), end: parisInstant('2026-11-24T10:20') },
          ],
        },
      ],
    });
  }

  function equalShareOf(employeeId: string): EqualShareReference {
    return EqualShareReference.freeze({
      organizationId: ORGANIZATION_A,
      employeeId,
      weekStartsOn: MONDAY,
      frozenAt: FROZEN_AT,
      timeZone: 'Europe/Paris',
      weeklyMinimumMinutes: 1680,
      activityDays: [0, 1, 2, 3, 4, 5].map((offset) => MONDAY.add({ days: offset })),
    });
  }

  it('fige la référence du planning avec l’absence, et la relit à l’identique', async () => {
    const tuesday = tuesdayOf(camille);
    await absences.add(tuesday, [planningReferenceOf(camille)]);

    const found = await references.find(ORGANIZATION_A, camille, MONDAY);

    expect(found).toBeInstanceOf(PlanningReference);
    expect(found).toEqual(planningReferenceOf(camille));
    expect(found?.value([tuesday])).toEqual({ status: 'VALUED', absenceMinutes: 420 });
  });

  it('relit la convention avec ses paramètres, puis avec la durée donnée par le manager', async () => {
    await absences.add(tuesdayOf(camille), [equalShareOf(camille)]);
    const thursday = Temporal.PlainDate.from('2026-11-26');

    expect(await references.find(ORGANIZATION_A, camille, MONDAY)).toEqual(equalShareOf(camille));
    const valued = equalShareOf(camille).withDayValuation(thursday, 180);
    expect(await references.saveDayValuations(valued)).toBe(true);
    expect(await references.find(ORGANIZATION_A, camille, MONDAY)).toEqual(valued);
  });

  it('garde la première référence figée pour le salarié et la semaine', async () => {
    await absences.add(tuesdayOf(camille), [planningReferenceOf(camille)]);

    await absences.add(tuesdayOf(camille), [planningReferenceOf(camille, LATER_GENERATION)]);

    const found = await references.find(ORGANIZATION_A, camille, MONDAY);
    expect(found).toMatchObject({ generationId: GENERATION });
  });

  it('ne fige qu’une référence quand deux absences de la semaine arrivent en même temps', async () => {
    const first = tuesdayOf(camille);
    const second = tuesdayOf(camille);

    await Promise.all([
      absences.add(first, [planningReferenceOf(camille)]),
      absences.add(second, [equalShareOf(camille)]),
    ]);

    expect(await prisma.absenceWeekReference.count()).toBe(1);
    expect(await absences.findById(ORGANIZATION_A, first.id)).toBeDefined();
    expect(await absences.findById(ORGANIZATION_A, second.id)).toBeDefined();
  });

  it('fige la référence à la modification, et rien quand l’absence n’existe plus', async () => {
    const tuesday = tuesdayOf(camille);
    await absences.add(tuesday, []);

    expect(await absences.update(tuesday, [planningReferenceOf(camille)])).toBe(true);
    expect(await references.find(ORGANIZATION_A, camille, MONDAY)).toBeDefined();

    const missing = tuesdayOf(employeeAtOtherSite);
    expect(await absences.update(missing, [planningReferenceOf(employeeAtOtherSite)])).toBe(false);
    expect(await references.find(ORGANIZATION_A, employeeAtOtherSite, MONDAY)).toBeUndefined();
  });

  it('BDD isolation : liste les références du site, et aucune depuis une autre organisation', async () => {
    await absences.add(tuesdayOf(camille), [planningReferenceOf(camille)]);
    await absences.add(tuesdayOf(employeeAtOtherSite), [equalShareOf(employeeAtOtherSite)]);

    const ofDemoSite = await references.listBySite(ORGANIZATION_A, DEMO_SITE, MONDAY);
    const seenFromB = await references.listBySite(ORGANIZATION_B, DEMO_SITE, MONDAY);

    expect(ofDemoSite.map((reference: AbsenceWeekReference) => reference.employeeId)).toEqual([
      camille,
    ]);
    expect(seenFromB).toEqual([]);
    expect(await references.find(ORGANIZATION_B, camille, MONDAY)).toBeUndefined();
  });

  it.each([
    ['une semaine qui ne commence pas un lundi', '2026-11-24', 'REFERENCE_PLANNING', null],
    [
      'un planning avec des paramètres de convention',
      '2026-11-23',
      'REFERENCE_PLANNING',
      'Europe/Paris',
    ],
    ['une méthode inconnue', '2026-11-23', 'PRORATA', null],
  ])('la migration interdit %s', async (_case, weekStartsOn, method, timeZone) => {
    await expect(prisma.$executeRaw`
      INSERT INTO staff.absence_week_references
        (organization_id, employee_id, week_starts_on, method, frozen_at, generation_id,
         worked_shifts, time_zone)
      VALUES
        (${ORGANIZATION_A}::uuid, ${camille}::uuid, ${weekStartsOn}::date, ${method},
         '2026-11-18T15:00:00Z', ${GENERATION}::uuid, '[]'::jsonb, ${timeZone})
    `).rejects.toThrow();
  });
});
