import {
  Contract,
  InvalidDayValuationError,
  NoPartialAbsenceOnDayError,
  type WorkedShift,
} from '@trame/api/staff/domain';
import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { anEmployee } from '../../testing/employee-builder';
import { InMemoryAbsenceWeekReferenceRepository } from '../../testing/in-memory-absence-week-reference.repository';
import { InMemoryAbsenceRepository } from '../../testing/in-memory-absence.repository';
import { InMemoryContractRepository } from '../../testing/in-memory-contract.repository';
import { InMemoryEmployeeRepository } from '../../testing/in-memory-employee.repository';
import { InMemoryOrganizationCatalog } from '../../testing/in-memory-organization-catalog';
import { InMemoryPlanningReferenceSource } from '../../testing/in-memory-planning-reference-source';
import { EmployeeNotFoundError, SiteNotFoundError } from '../not-found.errors';
import { AbsenceWeekReferenceFreezer } from './absence-week-reference-freezer';
import { AbsenceWeeksLookup } from './absence-weeks-lookup';
import { DeclareAbsence } from './declare-absence';
import { DeleteAbsence } from './delete-absence';
import { NoEqualShareReferenceError } from './absence-valuation.errors';
import { GetWeekAbsenceValuations } from './get-week-absence-valuations';
import { SetAbsenceDayValuation } from './set-absence-day-valuation';
import { UpdateAbsence } from './update-absence';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const DEMO_SITE = '0190f0a0-0000-7000-8000-0000000000d1';
const CAMILLE = '0190f0a0-0000-7000-8000-0000000000e1';
const EMPLOYEE_OF_B = '0190f0a0-0000-7000-8000-0000000000e4';
const FIRST_GENERATION = '0190f0a0-0000-7000-8000-000000000a01';
const LATER_GENERATION = '0190f0a0-0000-7000-8000-000000000a02';
const WEEK_OF_23_NOVEMBER = Temporal.PlainDate.from('2026-11-23');
const WEEK_OF_30_NOVEMBER = Temporal.PlainDate.from('2026-11-30');
const THURSDAY = Temporal.PlainDate.from('2026-11-26');
const HOURS = 60;

function parisInstant(localDateTime: string): Temporal.Instant {
  return Temporal.Instant.from(`${localDateTime}+01:00`);
}

/** Créneau du matin : 6 h – 13 h 20, pause de 10 h à 10 h 20 (7 h effectives). */
function morningShift(date: string): WorkedShift {
  return {
    startsAt: parisInstant(`${date}T06:00`),
    endsAt: parisInstant(`${date}T13:20`),
    breaks: [{ start: parisInstant(`${date}T10:00`), end: parisInstant(`${date}T10:20`) }],
  };
}

/** Camille Laurent le matin du lundi au jeudi, repos vendredi et samedi. */
const CAMILLE_MONDAY_TO_THURSDAY = {
  generationId: FIRST_GENERATION,
  workedShifts: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'].map(morningShift),
};

/** Un planning plus récent, calculé avec son absence du mardi : elle n'y travaille plus ce jour. */
const CAMILLE_WITHOUT_TUESDAY = {
  generationId: LATER_GENERATION,
  workedShifts: ['2026-11-23', '2026-11-25', '2026-11-26', '2026-11-27'].map(morningShift),
};

function weekDays(weekStartsOn: Temporal.PlainDate, count: number): Temporal.PlainDate[] {
  const days: Temporal.PlainDate[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    days.push(weekStartsOn.add({ days: offset }));
  }
  return days;
}

async function setUp() {
  const catalog = new InMemoryOrganizationCatalog();
  catalog.addSite(ORGANIZATION_A, DEMO_SITE, 'Europe/Paris');
  const employees = new InMemoryEmployeeRepository();
  await employees.add(
    anEmployee().withId(CAMILLE).named('Camille', 'Laurent').atSite(DEMO_SITE).build(),
  );
  await employees.add(anEmployee().withId(EMPLOYEE_OF_B).inOrganization(ORGANIZATION_B).build());
  const contracts = new InMemoryContractRepository();
  await contracts.add(
    Contract.create({
      id: '0190f0a0-0000-7000-8000-0000000000c1',
      organizationId: ORGANIZATION_A,
      employeeId: CAMILLE,
      weeklyMinutesMin: 28 * HOURS,
      weeklyMinutesMax: 35 * HOURS,
      startsOn: Temporal.PlainDate.from('2026-01-01'),
      endsOn: undefined,
      createdAt: Temporal.Instant.from('2026-01-01T08:00:00Z'),
    }),
  );
  const references = new InMemoryAbsenceWeekReferenceRepository(employees);
  const absences = new InMemoryAbsenceRepository(employees, references);
  const source = new InMemoryPlanningReferenceSource();
  const clock = new FixedClock('2026-11-18T15:00:00Z');
  const freezer = new AbsenceWeekReferenceFreezer(catalog, contracts, references, source);
  const weeks = new AbsenceWeeksLookup(catalog);
  return {
    clock,
    source,
    declareAbsence: new DeclareAbsence(
      employees,
      absences,
      freezer,
      clock,
      new SequentialIdGenerator(),
    ),
    updateAbsence: new UpdateAbsence(employees, absences, freezer, weeks, clock),
    deleteAbsence: new DeleteAbsence(employees, absences, weeks),
    getValuations: new GetWeekAbsenceValuations(catalog, absences, references),
    setDayValuation: new SetAbsenceDayValuation(employees, absences, references),
  };
}

type Services = Awaited<ReturnType<typeof setUp>>;

async function declareCamilleAbsent(services: Services, start: string, end: string) {
  return services.declareAbsence.execute({
    organizationId: ORGANIZATION_A,
    employeeId: CAMILLE,
    startsAt: parisInstant(start),
    endsAt: parisInstant(end),
    reason: 'LEAVE',
  });
}

async function giveCamilleDuration(services: Services, date: string, valuedMinutes: number) {
  return services.setDayValuation.execute({
    organizationId: ORGANIZATION_A,
    employeeId: CAMILLE,
    day: Temporal.PlainDate.from(date),
    valuedMinutes,
  });
}

async function moveCamilleAbsence(
  services: Services,
  absenceId: string,
  start: string,
  end: string,
) {
  return services.updateAbsence.execute({
    organizationId: ORGANIZATION_A,
    employeeId: CAMILLE,
    absenceId,
    startsAt: parisInstant(start),
    endsAt: parisInstant(end),
    reason: 'LEAVE',
  });
}

async function valuationOfCamille(services: Services, weekStartsOn = WEEK_OF_23_NOVEMBER) {
  const valuations = await services.getValuations.execute({
    organizationId: ORGANIZATION_A,
    siteId: DEMO_SITE,
    weekStartsOn,
  });
  return valuations.find((valuation) => valuation.employeeId === CAMILLE);
}

describe('valorisation figée des absences (US-033)', () => {
  describe('avec un planning de référence', () => {
    async function withReferencePlanning(): Promise<Services> {
      const services = await setUp();
      services.source.setLatestPlanning(
        DEMO_SITE,
        WEEK_OF_23_NOVEMBER,
        CAMILLE,
        CAMILLE_MONDAY_TO_THURSDAY,
      );
      return services;
    }

    it('BDD : fige la dernière génération réussie à la déclaration et valorise le mardi, 7 h', async () => {
      const services = await withReferencePlanning();

      await declareCamilleAbsent(services, '2026-11-24T00:00', '2026-11-25T00:00');

      const camille = await valuationOfCamille(services);
      expect(camille?.reference?.method).toBe('REFERENCE_PLANNING');
      expect(camille?.reference).toMatchObject({ generationId: FIRST_GENERATION });
      expect(camille?.valuation).toEqual({ status: 'VALUED', absenceMinutes: 7 * HOURS });
    });

    it('BDD : des générations répétées ne changent pas la référence', async () => {
      const services = await withReferencePlanning();
      await declareCamilleAbsent(services, '2026-11-24T00:00', '2026-11-25T00:00');

      // Deux générations plus tard, Camille ne travaille plus le mardi.
      services.source.setLatestPlanning(
        DEMO_SITE,
        WEEK_OF_23_NOVEMBER,
        CAMILLE,
        CAMILLE_WITHOUT_TUESDAY,
      );
      await declareCamilleAbsent(services, '2026-11-25T06:00', '2026-11-25T10:00');

      const camille = await valuationOfCamille(services);
      expect(camille?.reference).toMatchObject({ generationId: FIRST_GENERATION });
      expect(camille?.valuation).toEqual({ status: 'VALUED', absenceMinutes: 11 * HOURS });
    });

    it('BDD : une génération terminée après la déclaration ne devient pas la référence', async () => {
      const services = await withReferencePlanning();
      // La génération plus récente tourne encore : la source ne connaît que la première.
      await declareCamilleAbsent(services, '2026-11-24T00:00', '2026-11-25T00:00');

      services.source.setLatestPlanning(
        DEMO_SITE,
        WEEK_OF_23_NOVEMBER,
        CAMILLE,
        CAMILLE_WITHOUT_TUESDAY,
      );

      const camille = await valuationOfCamille(services);
      expect(camille?.reference).toMatchObject({ generationId: FIRST_GENERATION });
      expect(camille?.valuation).toEqual({ status: 'VALUED', absenceMinutes: 7 * HOURS });
    });

    it('BDD : supprimer une absence chevauchée garde les minutes que l’autre couvre encore', async () => {
      const services = await withReferencePlanning();
      const leave = await declareCamilleAbsent(services, '2026-11-24T00:00', '2026-11-25T00:00');
      await declareCamilleAbsent(services, '2026-11-24T00:00', '2026-11-26T00:00');
      expect((await valuationOfCamille(services))?.valuation).toEqual({
        status: 'VALUED',
        absenceMinutes: 14 * HOURS,
      });

      await services.deleteAbsence.execute({
        organizationId: ORGANIZATION_A,
        employeeId: CAMILLE,
        absenceId: leave.id,
      });

      expect((await valuationOfCamille(services))?.valuation).toEqual({
        status: 'VALUED',
        absenceMinutes: 14 * HOURS,
      });
    });

    it('BDD : modifier les dates valorise sur la même référence', async () => {
      const services = await withReferencePlanning();
      const tuesday = await declareCamilleAbsent(services, '2026-11-24T00:00', '2026-11-25T00:00');
      services.source.setLatestPlanning(
        DEMO_SITE,
        WEEK_OF_23_NOVEMBER,
        CAMILLE,
        CAMILLE_WITHOUT_TUESDAY,
      );

      await services.updateAbsence.execute({
        organizationId: ORGANIZATION_A,
        employeeId: CAMILLE,
        absenceId: tuesday.id,
        startsAt: parisInstant('2026-11-27T00:00'),
        endsAt: parisInstant('2026-11-28T00:00'),
        reason: 'LEAVE',
      });

      const camille = await valuationOfCamille(services);
      expect(camille?.reference).toMatchObject({ generationId: FIRST_GENERATION });
      expect(camille?.valuation).toEqual({ status: 'VALUED', absenceMinutes: 0 });
    });

    it('fige une référence pour chaque semaine d’une absence à cheval', async () => {
      const services = await withReferencePlanning();
      services.source.setActivityDays(
        DEMO_SITE,
        WEEK_OF_30_NOVEMBER,
        weekDays(WEEK_OF_30_NOVEMBER, 6),
      );

      await declareCamilleAbsent(services, '2026-11-26T00:00', '2026-12-01T00:00');

      expect((await valuationOfCamille(services))?.reference?.method).toBe('REFERENCE_PLANNING');
      const nextWeek = await valuationOfCamille(services, WEEK_OF_30_NOVEMBER);
      expect(nextWeek?.reference?.method).toBe('EQUAL_SHARE_OF_ACTIVITY_DAYS');
      expect(nextWeek?.valuation).toEqual({ status: 'VALUED', absenceMinutes: 4 * HOURS + 40 });
    });
  });

  describe('sans planning de référence', () => {
    async function withSixActivityDays(): Promise<Services> {
      const services = await setUp();
      services.source.setActivityDays(
        DEMO_SITE,
        WEEK_OF_23_NOVEMBER,
        weekDays(WEEK_OF_23_NOVEMBER, 6),
      );
      return services;
    }

    it('BDD : fige la convention et valorise deux journées, 9 h 20', async () => {
      const services = await withSixActivityDays();

      await declareCamilleAbsent(services, '2026-11-24T00:00', '2026-11-26T00:00');

      const camille = await valuationOfCamille(services);
      expect(camille?.reference).toMatchObject({
        method: 'EQUAL_SHARE_OF_ACTIVITY_DAYS',
        weeklyMinimumMinutes: 28 * HOURS,
        dailyShareMinutes: 4 * HOURS + 40,
      });
      expect(camille?.valuation).toEqual({ status: 'VALUED', absenceMinutes: 9 * HOURS + 20 });
    });

    it('BDD : une absence partielle attend une durée, puis la valorise', async () => {
      const services = await withSixActivityDays();
      await declareCamilleAbsent(services, '2026-11-26T06:00', '2026-11-26T10:00');
      expect((await valuationOfCamille(services))?.valuation).toEqual({
        status: 'TO_DEFINE',
        daysToDefine: [Temporal.PlainDate.from('2026-11-26')],
      });

      await giveCamilleDuration(services, '2026-11-26', 3 * HOURS);

      expect((await valuationOfCamille(services))?.valuation).toEqual({
        status: 'VALUED',
        absenceMinutes: 3 * HOURS,
      });
    });

    it('garde les durées de deux jours données en même temps', async () => {
      const services = await withSixActivityDays();
      await declareCamilleAbsent(services, '2026-11-25T06:00', '2026-11-25T10:00');
      await declareCamilleAbsent(services, '2026-11-26T06:00', '2026-11-26T10:00');

      await Promise.all([
        giveCamilleDuration(services, '2026-11-25', 2 * HOURS),
        giveCamilleDuration(services, '2026-11-26', 3 * HOURS),
      ]);

      expect((await valuationOfCamille(services))?.valuation).toEqual({
        status: 'VALUED',
        absenceMinutes: 5 * HOURS,
      });
    });

    it('BDD : refuse une durée pour un jour qu’aucune absence ne couvre en partie', async () => {
      const services = await withSixActivityDays();
      await declareCamilleAbsent(services, '2026-11-26T06:00', '2026-11-26T10:00');

      await expect(giveCamilleDuration(services, '2026-11-25', HOURS)).rejects.toThrow(
        NoPartialAbsenceOnDayError,
      );
      expect((await valuationOfCamille(services))?.valuation).toEqual({
        status: 'TO_DEFINE',
        daysToDefine: [THURSDAY],
      });
    });

    it('BDD : modifier l’absence du jour redemande sa durée', async () => {
      const services = await withSixActivityDays();
      const afternoon = await declareCamilleAbsent(
        services,
        '2026-11-26T14:00',
        '2026-11-26T16:00',
      );
      await giveCamilleDuration(services, '2026-11-26', 2 * HOURS);

      await moveCamilleAbsence(services, afternoon.id, '2026-11-26T14:00', '2026-11-26T18:00');

      expect((await valuationOfCamille(services))?.valuation).toEqual({
        status: 'TO_DEFINE',
        daysToDefine: [THURSDAY],
      });
    });

    it.each([
      ['aux mêmes heures', '2026-11-26T14:00', '2026-11-26T16:00'],
      ['à d’autres heures', '2026-11-26T09:00', '2026-11-26T10:00'],
    ])(
      'BDD : une absence saisie %s après la suppression ne reprend pas l’ancienne durée',
      async (_case, start, end) => {
        const services = await withSixActivityDays();
        const afternoon = await declareCamilleAbsent(
          services,
          '2026-11-26T14:00',
          '2026-11-26T16:00',
        );
        await giveCamilleDuration(services, '2026-11-26', 2 * HOURS);
        await services.deleteAbsence.execute({
          organizationId: ORGANIZATION_A,
          employeeId: CAMILLE,
          absenceId: afternoon.id,
        });

        await declareCamilleAbsent(services, start, end);

        expect((await valuationOfCamille(services))?.valuation).toEqual({
          status: 'TO_DEFINE',
          daysToDefine: [THURSDAY],
        });
      },
    );

    it('BDD : une absence déplacée hors du jour, puis ressaisie aux mêmes heures, ne reprend pas la durée', async () => {
      const services = await withSixActivityDays();
      const afternoon = await declareCamilleAbsent(
        services,
        '2026-11-26T14:00',
        '2026-11-26T16:00',
      );
      await giveCamilleDuration(services, '2026-11-26', 2 * HOURS);
      await moveCamilleAbsence(services, afternoon.id, '2026-11-27T14:00', '2026-11-27T16:00');

      await declareCamilleAbsent(services, '2026-11-26T14:00', '2026-11-26T16:00');

      const camille = await valuationOfCamille(services);
      expect(camille?.valuation).toEqual({
        status: 'TO_DEFINE',
        daysToDefine: [THURSDAY, Temporal.PlainDate.from('2026-11-27')],
      });
    });

    it('garde la durée tant qu’une absence touche le jour, même après la suppression d’une autre', async () => {
      const services = await withSixActivityDays();
      const early = await declareCamilleAbsent(services, '2026-11-26T14:00', '2026-11-26T15:00');
      await declareCamilleAbsent(services, '2026-11-26T15:00', '2026-11-26T16:00');
      await giveCamilleDuration(services, '2026-11-26', 2 * HOURS);
      await services.deleteAbsence.execute({
        organizationId: ORGANIZATION_A,
        employeeId: CAMILLE,
        absenceId: early.id,
      });

      await declareCamilleAbsent(services, '2026-11-26T14:00', '2026-11-26T15:00');

      expect((await valuationOfCamille(services))?.valuation).toEqual({
        status: 'VALUED',
        absenceMinutes: 2 * HOURS,
      });
    });

    it('BDD : garde la durée quand des absences remaniées couvrent le jour de la même façon', async () => {
      const services = await withSixActivityDays();
      const afternoon = await declareCamilleAbsent(
        services,
        '2026-11-26T14:00',
        '2026-11-26T16:00',
      );
      await giveCamilleDuration(services, '2026-11-26', 2 * HOURS);

      await moveCamilleAbsence(services, afternoon.id, '2026-11-26T14:00', '2026-11-26T15:00');
      await declareCamilleAbsent(services, '2026-11-26T15:00', '2026-11-26T16:00');

      expect((await valuationOfCamille(services))?.valuation).toEqual({
        status: 'VALUED',
        absenceMinutes: 2 * HOURS,
      });
    });

    it('BDD : refuse une durée au-delà de la part journalière', async () => {
      const services = await withSixActivityDays();
      await declareCamilleAbsent(services, '2026-11-26T06:00', '2026-11-26T10:00');

      await expect(giveCamilleDuration(services, '2026-11-26', 5 * HOURS)).rejects.toThrow(
        InvalidDayValuationError,
      );
    });

    it('BDD : la convention reste figée quand les besoins changent', async () => {
      const services = await withSixActivityDays();
      await declareCamilleAbsent(services, '2026-11-24T00:00', '2026-11-25T00:00');

      services.source.setActivityDays(
        DEMO_SITE,
        WEEK_OF_23_NOVEMBER,
        weekDays(WEEK_OF_23_NOVEMBER, 5),
      );
      await declareCamilleAbsent(services, '2026-11-25T00:00', '2026-11-26T00:00');

      const camille = await valuationOfCamille(services);
      expect(camille?.reference).toMatchObject({ dailyShareMinutes: 4 * HOURS + 40 });
      expect(camille?.valuation).toEqual({ status: 'VALUED', absenceMinutes: 9 * HOURS + 20 });
    });

    it('refuse une durée quand la semaine est valorisée sur un planning de référence', async () => {
      const services = await setUp();
      services.source.setLatestPlanning(
        DEMO_SITE,
        WEEK_OF_23_NOVEMBER,
        CAMILLE,
        CAMILLE_MONDAY_TO_THURSDAY,
      );
      await declareCamilleAbsent(services, '2026-11-26T06:00', '2026-11-26T10:00');

      await expect(giveCamilleDuration(services, '2026-11-26', HOURS)).rejects.toThrow(
        NoEqualShareReferenceError,
      );
    });
  });

  describe('valorisation « à définir »', () => {
    it('BDD : une semaine sans jour d’activité reste « à définir », puis se fige à la saisie suivante', async () => {
      const services = await setUp();
      const monday = await declareCamilleAbsent(services, '2026-11-30T00:00', '2026-12-01T00:00');
      expect(await valuationOfCamille(services, WEEK_OF_30_NOVEMBER)).toEqual({
        employeeId: CAMILLE,
        reference: undefined,
        valuation: { status: 'TO_DEFINE', daysToDefine: [] },
      });

      services.source.setActivityDays(
        DEMO_SITE,
        WEEK_OF_30_NOVEMBER,
        weekDays(WEEK_OF_30_NOVEMBER, 6),
      );
      await services.updateAbsence.execute({
        organizationId: ORGANIZATION_A,
        employeeId: CAMILLE,
        absenceId: monday.id,
        startsAt: monday.startsAt,
        endsAt: monday.endsAt,
        reason: 'SICK_LEAVE',
      });

      expect((await valuationOfCamille(services, WEEK_OF_30_NOVEMBER))?.valuation).toEqual({
        status: 'VALUED',
        absenceMinutes: 4 * HOURS + 40,
      });
    });

    it('reste « à définir » sans contrat qui couvre la semaine', async () => {
      const services = await setUp();
      const weekBeforeContract = Temporal.PlainDate.from('2025-12-29');
      services.source.setActivityDays(
        DEMO_SITE,
        weekBeforeContract,
        weekDays(weekBeforeContract, 6),
      );

      await declareCamilleAbsent(services, '2025-12-30T00:00', '2025-12-31T00:00');

      expect((await valuationOfCamille(services, weekBeforeContract))?.valuation).toEqual({
        status: 'TO_DEFINE',
        daysToDefine: [],
      });
    });
  });

  describe('BDD isolation', () => {
    it('refuse les valorisations d’un site vu d’une autre organisation', async () => {
      const services = await setUp();

      await expect(
        services.getValuations.execute({
          organizationId: ORGANIZATION_B,
          siteId: DEMO_SITE,
          weekStartsOn: WEEK_OF_23_NOVEMBER,
        }),
      ).rejects.toThrow(SiteNotFoundError);
    });

    it('refuse une durée pour un employé d’une autre organisation', async () => {
      const services = await setUp();

      await expect(
        services.setDayValuation.execute({
          organizationId: ORGANIZATION_A,
          employeeId: EMPLOYEE_OF_B,
          day: Temporal.PlainDate.from('2026-11-26'),
          valuedMinutes: HOURS,
        }),
      ).rejects.toThrow(EmployeeNotFoundError);
    });
  });
});
