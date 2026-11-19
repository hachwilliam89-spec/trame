import { PrismaDatabase, PrismaService } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { anEmployee } from '@trame/api/staff/application/testing';
import { Absence, type AbsenceReason } from '@trame/api/staff/domain';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { PrismaAbsenceRepository } from './prisma-absence.repository';
import { PrismaEmployeeRepository } from './prisma-employee.repository';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const DEMO_SITE = '0190f0a0-0000-7000-8000-0000000000d1';
const OTHER_SITE = '0190f0a0-0000-7000-8000-0000000000d2';
// Semaine du lundi 23 novembre 2026, à l'heure de Paris.
const MONDAY = Temporal.Instant.from('2026-11-23T00:00:00+01:00');
const NEXT_MONDAY = Temporal.Instant.from('2026-11-30T00:00:00+01:00');

describe('absences sur PostgreSQL (US-033, jalon 2)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let absences: PrismaAbsenceRepository;
  let ids: SequentialIdGenerator;
  let ines: string;
  let yanis: string;
  let employeeAtOtherSite: string;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
    absences = new PrismaAbsenceRepository(new PrismaDatabase(prisma));
  }, 120_000);

  beforeEach(async () => {
    // Cette base est propre au fichier ; les autres suites ont leur propre base migrée.
    await prisma.absence.deleteMany();
    await prisma.employeeQualification.deleteMany();
    await prisma.employee.deleteMany();
    ids = new SequentialIdGenerator();
    ines = ids.next();
    yanis = ids.next();
    employeeAtOtherSite = ids.next();
    const employees = new PrismaEmployeeRepository(new PrismaDatabase(prisma));
    await employees.add(anEmployee().withId(ines).named('Inès', 'Fabre').atSite(DEMO_SITE).build());
    await employees.add(
      anEmployee().withId(yanis).named('Yanis', 'Morel').atSite(DEMO_SITE).build(),
    );
    await employees.add(anEmployee().withId(employeeAtOtherSite).atSite(OTHER_SITE).build());
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  /** Absence de `start` (inclus) à `end` (exclu), heure de Paris en novembre 2026. */
  function absenceOf(
    employeeId: string,
    start: string,
    end: string,
    reason: AbsenceReason = 'LEAVE',
  ): Absence {
    return Absence.create({
      id: ids.next(),
      organizationId: ORGANIZATION_A,
      employeeId,
      startsAt: Temporal.Instant.from(`${start}+01:00`),
      endsAt: Temporal.Instant.from(`${end}+01:00`),
      reason,
      createdAt: Temporal.Instant.from('2026-11-18T15:00:00.123Z'),
    });
  }

  async function idsOfTheWeek(organizationId = ORGANIZATION_A, siteId = DEMO_SITE) {
    const found = await absences.listBySiteOverlapping(organizationId, siteId, MONDAY, NEXT_MONDAY);
    return found.map((absence) => absence.id);
  }

  it('enregistre une absence et la relit avec sa période, son motif et sa date', async () => {
    const thursdayMorning = absenceOf(yanis, '2026-11-26T06:00', '2026-11-26T10:00', 'TRAINING');
    await absences.add(thursdayMorning, []);

    const found = await absences.findById(ORGANIZATION_A, thursdayMorning.id);

    expect(found?.employeeId).toBe(yanis);
    expect(found?.startsAt.toString()).toBe('2026-11-26T05:00:00Z');
    expect(found?.endsAt.toString()).toBe('2026-11-26T09:00:00Z');
    expect(found?.reason).toBe('TRAINING');
    expect(found?.createdAt.toString()).toBe('2026-11-18T15:00:00.123Z');
  });

  it('relit exactement les instants renvoyés à la déclaration, sans troncature', async () => {
    const leave = absenceOf(ines, '2026-11-24T00:00', '2026-11-26T00:00');
    await absences.add(leave, []);

    const found = await absences.findById(ORGANIZATION_A, leave.id);

    expect(found?.startsAt.equals(leave.startsAt)).toBe(true);
    expect(found?.endsAt.equals(leave.endsAt)).toBe(true);
    expect(found?.createdAt.equals(leave.createdAt)).toBe(true);
  });

  it('remplace la période et le motif d’une absence', async () => {
    const leave = absenceOf(ines, '2026-11-24T00:00', '2026-11-25T00:00');
    await absences.add(leave, []);
    const moved = leave.changeTo({
      startsAt: Temporal.Instant.from('2026-11-27T00:00:00+01:00'),
      endsAt: Temporal.Instant.from('2026-11-28T00:00:00+01:00'),
      reason: 'SICK_LEAVE',
    });

    expect(await absences.update(moved, [])).toBe(true);

    const found = await absences.findById(ORGANIZATION_A, leave.id);
    expect(found?.startsAt.toString()).toBe('2026-11-26T23:00:00Z');
    expect(found?.reason).toBe('SICK_LEAVE');
  });

  it('supprime une absence, une seule fois', async () => {
    const mistake = absenceOf(ines, '2026-11-24T00:00', '2026-11-25T00:00');
    await absences.add(mistake, []);

    expect(await absences.remove(ORGANIZATION_A, mistake.id)).toBe(true);
    expect(await absences.remove(ORGANIZATION_A, mistake.id)).toBe(false);
    expect(await absences.findById(ORGANIZATION_A, mistake.id)).toBeUndefined();
  });

  it('BDD isolation : ni lecture, ni modification, ni suppression depuis une autre organisation', async () => {
    const leave = absenceOf(ines, '2026-11-24T00:00', '2026-11-25T00:00');
    await absences.add(leave, []);
    const seenFromB = Absence.create({ ...leave, organizationId: ORGANIZATION_B });

    expect(await absences.findById(ORGANIZATION_B, leave.id)).toBeUndefined();
    expect(await absences.update(seenFromB, [])).toBe(false);
    expect(await absences.remove(ORGANIZATION_B, leave.id)).toBe(false);
    expect(await idsOfTheWeek(ORGANIZATION_B)).toEqual([]);
    expect(await idsOfTheWeek()).toEqual([leave.id]);
  });

  it('liste les absences du site qui touchent la semaine, par début puis par identifiant', async () => {
    const fromLastWeek = absenceOf(ines, '2026-11-20T00:00', '2026-11-24T00:00');
    const tuesday = absenceOf(yanis, '2026-11-24T00:00', '2026-11-25T00:00');
    const sameStart = absenceOf(ines, '2026-11-24T00:00', '2026-11-26T00:00', 'SICK_LEAVE');
    const intoNextWeek = absenceOf(yanis, '2026-11-29T22:00', '2026-12-01T00:00');
    const endsAtMonday = absenceOf(ines, '2026-11-22T00:00', '2026-11-23T00:00');
    const startsNextMonday = absenceOf(ines, '2026-11-30T00:00', '2026-12-01T00:00');
    const atOtherSite = absenceOf(employeeAtOtherSite, '2026-11-24T00:00', '2026-11-25T00:00');
    for (const absence of [
      intoNextWeek,
      sameStart,
      endsAtMonday,
      tuesday,
      startsNextMonday,
      atOtherSite,
      fromLastWeek,
    ]) {
      await absences.add(absence, []);
    }

    expect(await idsOfTheWeek()).toEqual([
      fromLastWeek.id,
      tuesday.id,
      sameStart.id,
      intoNextWeek.id,
    ]);
    expect(await idsOfTheWeek(ORGANIZATION_A, OTHER_SITE)).toEqual([atOtherSite.id]);
  });

  it('liste les absences d’un employé qui touchent une période, et aucune depuis une autre organisation', async () => {
    const thursdayAfternoon = absenceOf(ines, '2026-11-26T14:00', '2026-11-26T16:00');
    const thursdayMorning = absenceOf(ines, '2026-11-26T06:00', '2026-11-26T10:00');
    const endsAtMonday = absenceOf(ines, '2026-11-22T00:00', '2026-11-23T00:00');
    const ofYanis = absenceOf(yanis, '2026-11-26T06:00', '2026-11-26T10:00');
    for (const absence of [thursdayAfternoon, endsAtMonday, ofYanis, thursdayMorning]) {
      await absences.add(absence, []);
    }

    const ofInes = await absences.listByEmployeeOverlapping(
      ORGANIZATION_A,
      ines,
      MONDAY,
      NEXT_MONDAY,
    );
    const seenFromB = await absences.listByEmployeeOverlapping(
      ORGANIZATION_B,
      ines,
      MONDAY,
      NEXT_MONDAY,
    );

    expect(ofInes.map((absence) => absence.id)).toEqual([thursdayMorning.id, thursdayAfternoon.id]);
    expect(seenFromB).toEqual([]);
  });

  it.each([
    ['une fin égale au début', '2026-11-24T06:00:00+01:00', 'LEAVE'],
    ['un motif hors des catégories', '2026-11-24T10:00:00+01:00', 'MALADIE'],
    ['une fin hors de la minute', '2026-11-24T10:00:00.001+01:00', 'LEAVE'],
  ])('la migration interdit %s', async (_case, endsAt, reason) => {
    const absenceId = ids.next();

    await expect(prisma.$executeRaw`
      INSERT INTO staff.absences
        (id, organization_id, employee_id, starts_at, ends_at, reason, created_at)
      VALUES
        (${absenceId}::uuid, ${ORGANIZATION_A}::uuid, ${ines}::uuid, '2026-11-24T06:00:00+01:00',
         ${endsAt}::timestamptz, ${reason}, '2026-11-18T15:00:00Z')
    `).rejects.toThrow();
  });

  it('refuse une absence dont l’employé appartient à une autre organisation', async () => {
    const crossOrganization = Absence.create({
      ...absenceOf(ines, '2026-11-24T00:00', '2026-11-25T00:00'),
      organizationId: ORGANIZATION_B,
    });

    await expect(absences.add(crossOrganization, [])).rejects.toThrow();
  });
});
