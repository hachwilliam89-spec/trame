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
import { PrismaWeekAbsencesSnapshotReader } from './prisma-week-absences-snapshot.reader';

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

  /** Absence de `start` (inclus) à `end` (exclu), heure de Paris en novembre 2026. */
  function absenceOf(employeeId: string, start: string, end: string): Absence {
    return Absence.create({
      id: ids.next(),
      organizationId: ORGANIZATION_A,
      employeeId,
      startsAt: parisInstant(start),
      endsAt: parisInstant(end),
      reason: 'LEAVE',
      createdAt: FROZEN_AT,
    });
  }

  function tuesdayOf(employeeId: string): Absence {
    return absenceOf(employeeId, '2026-11-24T00:00', '2026-11-25T00:00');
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

  it('relit la convention, puis la durée d’un jour avec la couverture qu’elle valorise', async () => {
    await absences.add(tuesdayOf(camille), [equalShareOf(camille)]);
    const thursday = Temporal.PlainDate.from('2026-11-26');
    const thursdayMornings = [
      absenceOf(camille, '2026-11-26T06:00', '2026-11-26T08:00'),
      absenceOf(camille, '2026-11-26T09:00', '2026-11-26T10:00'),
    ];
    for (const absence of thursdayMornings) {
      await absences.add(absence, []);
    }

    expect(await references.find(ORGANIZATION_A, camille, MONDAY)).toEqual(equalShareOf(camille));
    const valued = equalShareOf(camille).withDayValuation(thursday, 180, thursdayMornings);
    expect(await references.saveDayValuation(valued, thursday)).toBe('SAVED');
    const found = await references.find(ORGANIZATION_A, camille, MONDAY);
    expect(found).toEqual(valued);
    expect(found?.value(thursdayMornings)).toEqual({ status: 'VALUED', absenceMinutes: 180 });
  });

  it('garde les durées de deux jours enregistrées en même temps depuis la même lecture', async () => {
    await absences.add(tuesdayOf(camille), [equalShareOf(camille)]);
    const read = await references.find(ORGANIZATION_A, camille, MONDAY);
    if (!(read instanceof EqualShareReference)) {
      throw new TypeError('La référence relue doit être la convention.');
    }
    const thursday = Temporal.PlainDate.from('2026-11-26');
    const friday = Temporal.PlainDate.from('2026-11-27');
    const partialAbsences = [
      absenceOf(camille, '2026-11-26T06:00', '2026-11-26T10:00'),
      absenceOf(camille, '2026-11-27T14:00', '2026-11-27T16:00'),
    ];
    for (const absence of partialAbsences) {
      await absences.add(absence, []);
    }

    await Promise.all([
      references.saveDayValuation(read.withDayValuation(thursday, 180, partialAbsences), thursday),
      references.saveDayValuation(read.withDayValuation(friday, 120, partialAbsences), friday),
    ]);

    const found = await references.find(ORGANIZATION_A, camille, MONDAY);
    expect(found?.value([tuesdayOf(camille), ...partialAbsences])).toEqual({
      status: 'VALUED',
      absenceMinutes: 280 + 180 + 120,
    });
  });

  it('fige les références absentes et garde celles déjà figées', async () => {
    await absences.add(tuesdayOf(camille), [planningReferenceOf(camille)]);

    await references.saveIfAbsent([
      planningReferenceOf(camille, LATER_GENERATION),
      equalShareOf(employeeAtOtherSite),
    ]);

    expect(await references.find(ORGANIZATION_A, camille, MONDAY)).toEqual(
      planningReferenceOf(camille),
    );
    expect(await references.find(ORGANIZATION_A, employeeAtOtherSite, MONDAY)).toEqual(
      equalShareOf(employeeAtOtherSite),
    );
  });

  it('lit ensemble les absences d’une période et les références de la semaine du site', async () => {
    const tuesday = tuesdayOf(camille);
    const nextMondayMorning = absenceOf(camille, '2026-11-30T00:00', '2026-11-30T06:00');
    await absences.add(tuesday, [equalShareOf(camille)]);
    await absences.add(nextMondayMorning, []);
    await absences.add(tuesdayOf(employeeAtOtherSite), [equalShareOf(employeeAtOtherSite)]);
    const reader = new PrismaWeekAbsencesSnapshotReader(prisma);

    const snapshot = await reader.read(
      ORGANIZATION_A,
      DEMO_SITE,
      MONDAY,
      parisInstant('2026-11-23T00:00'),
      parisInstant('2026-11-30T06:00'),
    );
    const seenFromB = await reader.read(
      ORGANIZATION_B,
      DEMO_SITE,
      MONDAY,
      parisInstant('2026-11-23T00:00'),
      parisInstant('2026-11-30T06:00'),
    );

    expect(snapshot.absences).toEqual([tuesday, nextMondayMorning]);
    expect(snapshot.references).toEqual([equalShareOf(camille)]);
    expect(seenFromB).toEqual({ absences: [], references: [] });
  });

  describe('durée d’un jour resté sans absence', () => {
    const THURSDAY = Temporal.PlainDate.from('2026-11-26');

    /** Camille absente le jeudi de 14 h à 16 h, valorisée 2 h par convention. */
    async function valuedThursdayAfternoon() {
      const afternoon = absenceOf(camille, '2026-11-26T14:00', '2026-11-26T16:00');
      await absences.add(afternoon, [equalShareOf(camille)]);
      const valued = equalShareOf(camille).withDayValuation(THURSDAY, 120, [afternoon]);
      expect(await references.saveDayValuation(valued, THURSDAY)).toBe('SAVED');
      return { afternoon, valued };
    }

    it('efface la durée dans la transaction qui supprime la dernière absence du jour', async () => {
      const { afternoon } = await valuedThursdayAfternoon();

      expect(await absences.remove(afternoon, [MONDAY])).toBe(true);

      expect(await references.find(ORGANIZATION_A, camille, MONDAY)).toEqual(equalShareOf(camille));
    });

    it('garde la durée tant qu’une autre absence touche le jour', async () => {
      const { afternoon, valued } = await valuedThursdayAfternoon();
      await absences.add(absenceOf(camille, '2026-11-26T15:00', '2026-11-26T16:00'), []);

      expect(await absences.remove(afternoon, [MONDAY])).toBe(true);

      expect(await references.find(ORGANIZATION_A, camille, MONDAY)).toEqual(valued);
    });

    it('efface la durée quand les deux absences du jour sont supprimées en même temps', async () => {
      const early = absenceOf(camille, '2026-11-26T14:00', '2026-11-26T15:00');
      const late = absenceOf(camille, '2026-11-26T15:00', '2026-11-26T16:00');
      await absences.add(early, [equalShareOf(camille)]);
      await absences.add(late, []);
      const valued = equalShareOf(camille).withDayValuation(THURSDAY, 120, [early, late]);
      expect(await references.saveDayValuation(valued, THURSDAY)).toBe('SAVED');

      await Promise.all([absences.remove(early, [MONDAY]), absences.remove(late, [MONDAY])]);

      expect(await references.find(ORGANIZATION_A, camille, MONDAY)).toEqual(equalShareOf(camille));
    });

    it('efface la durée quand une modification déplace la dernière absence hors du jour', async () => {
      const { afternoon } = await valuedThursdayAfternoon();
      const movedToFriday = afternoon.changeTo({
        startsAt: parisInstant('2026-11-27T14:00'),
        endsAt: parisInstant('2026-11-27T16:00'),
        reason: 'LEAVE',
      });

      expect(await absences.update(movedToFriday, [], [MONDAY])).toBe(true);

      expect(await references.find(ORGANIZATION_A, camille, MONDAY)).toEqual(equalShareOf(camille));
    });

    it('n’enregistre pas une durée dont le jour a perdu sa dernière absence avant l’écriture', async () => {
      const afternoon = absenceOf(camille, '2026-11-26T14:00', '2026-11-26T16:00');
      await absences.add(afternoon, [equalShareOf(camille)]);
      const valued = equalShareOf(camille).withDayValuation(THURSDAY, 120, [afternoon]);
      await absences.remove(afternoon, []);

      expect(await references.saveDayValuation(valued, THURSDAY)).toBe('DAY_WITHOUT_ABSENCE');
      expect(await references.find(ORGANIZATION_A, camille, MONDAY)).toEqual(equalShareOf(camille));
    });

    it('BDD isolation : n’écrit pas de durée sur la référence d’une autre organisation', async () => {
      const { afternoon } = await valuedThursdayAfternoon();
      const seenFromB = EqualShareReference.freeze({
        ...equalShareOf(camille),
        organizationId: ORGANIZATION_B,
      }).withDayValuation(THURSDAY, 60, [
        Absence.create({ ...afternoon, organizationId: ORGANIZATION_B }),
      ]);

      expect(await references.saveDayValuation(seenFromB, THURSDAY)).toBe('REFERENCE_NOT_FOUND');
    });
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

    expect(await absences.update(tuesday, [planningReferenceOf(camille)], [])).toBe(true);
    expect(await references.find(ORGANIZATION_A, camille, MONDAY)).toBeDefined();

    const missing = tuesdayOf(employeeAtOtherSite);
    expect(await absences.update(missing, [planningReferenceOf(employeeAtOtherSite)], [])).toBe(
      false,
    );
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

  it('la migration interdit une convention sans minimum hebdomadaire', async () => {
    async function insertConventionOf(employeeId: string, weeklyMinimumMinutes: number | null) {
      await prisma.$executeRaw`
        INSERT INTO staff.absence_week_references
          (organization_id, employee_id, week_starts_on, method, frozen_at, time_zone,
           weekly_minimum_minutes, activity_days, day_valuations)
        VALUES
          (${ORGANIZATION_A}::uuid, ${employeeId}::uuid, '2026-11-23'::date,
           'EQUAL_SHARE_OF_ACTIVITY_DAYS', '2026-11-18T15:00:00Z', 'Europe/Paris',
           ${weeklyMinimumMinutes}::integer, '["2026-11-23"]'::jsonb, '{}'::jsonb)
      `;
    }

    await insertConventionOf(camille, 1680);
    await expect(insertConventionOf(employeeAtOtherSite, null)).rejects.toThrow(
      'absence_week_references_method_check',
    );
  });
});
