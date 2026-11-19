import { PrismaDatabase, PrismaService } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import {
  DeleteAbsence,
  SetAbsenceDayValuation,
  AbsenceWeeksLookup,
} from '@trame/api/staff/application';
import { InMemoryOrganizationCatalog, anEmployee } from '@trame/api/staff/application/testing';
import { Absence, EqualShareReference, NoPartialAbsenceOnDayError } from '@trame/api/staff/domain';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { PrismaAbsenceWeekReferenceRepository } from './prisma-absence-week-reference.repository';
import { PrismaAbsenceRepository } from './prisma-absence.repository';
import { PrismaEmployeeRepository } from './prisma-employee.repository';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const DEMO_SITE = '0190f0a0-0000-7000-8000-0000000000d1';
const MONDAY = Temporal.PlainDate.from('2026-11-23');
const THURSDAY = Temporal.PlainDate.from('2026-11-26');
const FROZEN_AT = Temporal.Instant.from('2026-11-18T15:00:00Z');
// L'ordre fautif dépend de l'entrelacement des requêtes : chaque tentative le rejoue.
const ATTEMPTS = 20;

describe('durée d’un jour et suppression simultanée, sur PostgreSQL (US-033)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let absences: PrismaAbsenceRepository;
  let references: PrismaAbsenceWeekReferenceRepository;
  let setDayValuation: SetAbsenceDayValuation;
  let deleteAbsence: DeleteAbsence;
  let ids: SequentialIdGenerator;
  let camille: string;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
    const prismaDatabase = new PrismaDatabase(prisma);
    absences = new PrismaAbsenceRepository(prismaDatabase);
    references = new PrismaAbsenceWeekReferenceRepository(prismaDatabase);
    const employees = new PrismaEmployeeRepository(prismaDatabase);
    const catalog = new InMemoryOrganizationCatalog();
    catalog.addSite(ORGANIZATION_A, DEMO_SITE, 'Europe/Paris');
    setDayValuation = new SetAbsenceDayValuation(employees, absences, references);
    deleteAbsence = new DeleteAbsence(employees, absences, new AbsenceWeeksLookup(catalog));
    ids = new SequentialIdGenerator();
    camille = ids.next();
    await employees.add(anEmployee().withId(camille).atSite(DEMO_SITE).build());
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  function equalShareOfCamille(): EqualShareReference {
    return EqualShareReference.freeze({
      organizationId: ORGANIZATION_A,
      employeeId: camille,
      weekStartsOn: MONDAY,
      frozenAt: FROZEN_AT,
      timeZone: 'Europe/Paris',
      weeklyMinimumMinutes: 1680,
      activityDays: [0, 1, 2, 3, 4, 5].map((offset) => MONDAY.add({ days: offset })),
    });
  }

  async function declareThursdayAfternoon(): Promise<Absence> {
    const afternoon = Absence.create({
      id: ids.next(),
      organizationId: ORGANIZATION_A,
      employeeId: camille,
      startsAt: Temporal.Instant.from('2026-11-26T14:00:00+01:00'),
      endsAt: Temporal.Instant.from('2026-11-26T16:00:00+01:00'),
      reason: 'LEAVE',
      createdAt: FROZEN_AT,
    });
    await absences.add(afternoon, [equalShareOfCamille()]);
    return afternoon;
  }

  /** La saisie est refusée si elle lit les absences après la suppression : c'est attendu. */
  async function giveThursdayDuration(): Promise<void> {
    try {
      await setDayValuation.execute({
        organizationId: ORGANIZATION_A,
        employeeId: camille,
        day: THURSDAY,
        valuedMinutes: 120,
      });
    } catch (error) {
      if (!(error instanceof NoPartialAbsenceOnDayError)) {
        throw error;
      }
    }
  }

  it('ne laisse aucune durée au jour dont la dernière absence est supprimée pendant la saisie', async () => {
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      await prisma.absenceWeekReference.deleteMany();
      await prisma.absence.deleteMany();
      const afternoon = await declareThursdayAfternoon();

      await Promise.all([
        giveThursdayDuration(),
        deleteAbsence.execute({
          organizationId: ORGANIZATION_A,
          employeeId: camille,
          absenceId: afternoon.id,
        }),
      ]);

      expect(await references.find(ORGANIZATION_A, camille, MONDAY)).toEqual(equalShareOfCamille());
    }
  });
});
