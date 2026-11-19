import {
  InvalidAbsencePeriodError,
  InvalidWeekStartError,
  type AbsenceReason,
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
import {
  AbsenceNotFoundError,
  EmployeeNotFoundError,
  SiteNotFoundError,
} from '../not-found.errors';
import { AbsenceWeekReferenceFreezer } from './absence-week-reference-freezer';
import { DeclareAbsence, type DeclareAbsenceCommand } from './declare-absence';
import { DeleteAbsence } from './delete-absence';
import { ListWeekAbsences } from './list-week-absences';
import { UpdateAbsence } from './update-absence';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const DEMO_SITE = '0190f0a0-0000-7000-8000-0000000000d1';
const OTHER_SITE = '0190f0a0-0000-7000-8000-0000000000d2';
const SITE_OF_B = '0190f0a0-0000-7000-8000-0000000000d3';
const INES = '0190f0a0-0000-7000-8000-0000000000e1';
const YANIS = '0190f0a0-0000-7000-8000-0000000000e2';
const EMPLOYEE_AT_OTHER_SITE = '0190f0a0-0000-7000-8000-0000000000e3';
const EMPLOYEE_OF_B = '0190f0a0-0000-7000-8000-0000000000e4';
const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';
const WEEK_OF_23_NOVEMBER = Temporal.PlainDate.from('2026-11-23');
const now = Temporal.Instant.from('2026-11-18T15:00:00Z');

async function setUp() {
  const catalog = new InMemoryOrganizationCatalog();
  catalog.addSite(ORGANIZATION_A, DEMO_SITE, 'Europe/Paris');
  catalog.addSite(ORGANIZATION_A, OTHER_SITE, 'Europe/Paris');
  catalog.addSite(ORGANIZATION_B, SITE_OF_B, 'Europe/Paris');
  const employees = new InMemoryEmployeeRepository();
  await employees.add(anEmployee().withId(INES).named('Inès', 'Fabre').atSite(DEMO_SITE).build());
  await employees.add(anEmployee().withId(YANIS).named('Yanis', 'Morel').atSite(DEMO_SITE).build());
  await employees.add(anEmployee().withId(EMPLOYEE_AT_OTHER_SITE).atSite(OTHER_SITE).build());
  await employees.add(
    anEmployee().withId(EMPLOYEE_OF_B).inOrganization(ORGANIZATION_B).atSite(SITE_OF_B).build(),
  );
  const references = new InMemoryAbsenceWeekReferenceRepository(employees);
  const absences = new InMemoryAbsenceRepository(employees, references);
  const clock = new FixedClock(now);
  const freezer = new AbsenceWeekReferenceFreezer(
    catalog,
    new InMemoryContractRepository(),
    references,
    new InMemoryPlanningReferenceSource(),
  );
  return {
    declareAbsence: new DeclareAbsence(
      employees,
      absences,
      freezer,
      clock,
      new SequentialIdGenerator(),
    ),
    updateAbsence: new UpdateAbsence(employees, absences, freezer, clock),
    deleteAbsence: new DeleteAbsence(absences),
    listWeekAbsences: new ListWeekAbsences(catalog, absences),
  };
}

type Services = Awaited<ReturnType<typeof setUp>>;

/** Une absence de `start` (inclus) à `end` (exclu), heure de Paris en novembre 2026. */
function absence(
  start: string,
  end: string,
  overrides: Partial<DeclareAbsenceCommand> = {},
): DeclareAbsenceCommand {
  return {
    organizationId: ORGANIZATION_A,
    employeeId: INES,
    startsAt: Temporal.Instant.from(`${start}+01:00`),
    endsAt: Temporal.Instant.from(`${end}+01:00`),
    reason: 'LEAVE',
    ...overrides,
  };
}

async function absencesOfTheWeek(services: Services, weekStartsOn = WEEK_OF_23_NOVEMBER) {
  return services.listWeekAbsences.execute({
    organizationId: ORGANIZATION_A,
    siteId: DEMO_SITE,
    weekStartsOn,
  });
}

function change(start: string, end: string, reason: AbsenceReason = 'LEAVE') {
  return {
    startsAt: Temporal.Instant.from(`${start}+01:00`),
    endsAt: Temporal.Instant.from(`${end}+01:00`),
    reason,
  };
}

describe('cas d’usage des absences (US-033)', () => {
  describe('déclarer', () => {
    it('attribue l’identifiant et l’instant de déclaration par les ports dédiés', async () => {
      const services = await setUp();

      const declared = await services.declareAbsence.execute(
        absence('2026-11-24T00:00', '2026-11-26T00:00'),
      );

      expect(declared.id).toBe('00000000-0000-7000-8000-000000000001');
      expect(declared.createdAt.equals(now)).toBe(true);
      expect(await absencesOfTheWeek(services)).toEqual([declared]);
    });

    it('accepte deux absences du même employé qui se chevauchent', async () => {
      const services = await setUp();
      const leave = await services.declareAbsence.execute(
        absence('2026-11-24T00:00', '2026-11-25T00:00'),
      );

      const sickLeave = await services.declareAbsence.execute(
        absence('2026-11-24T00:00', '2026-11-26T00:00', { reason: 'SICK_LEAVE' }),
      );

      expect(await absencesOfTheWeek(services)).toEqual([leave, sickLeave]);
    });

    it.each([
      ['absent', UNKNOWN_ID],
      ['d’une autre organisation', EMPLOYEE_OF_B],
    ])('BDD isolation : refuse l’absence d’un employé %s', async (_case, employeeId) => {
      const services = await setUp();

      await expect(
        services.declareAbsence.execute(
          absence('2026-11-24T00:00', '2026-11-26T00:00', { employeeId }),
        ),
      ).rejects.toThrow(EmployeeNotFoundError);
    });

    it('BDD : refuse une période dont la fin précède le début, sans rien enregistrer', async () => {
      const services = await setUp();

      await expect(
        services.declareAbsence.execute(absence('2026-11-26T00:00', '2026-11-24T00:00')),
      ).rejects.toThrow(InvalidAbsencePeriodError);
      expect(await absencesOfTheWeek(services)).toEqual([]);
    });
  });

  describe('modifier', () => {
    it('change la période et le motif, sans changer l’instant de déclaration', async () => {
      const services = await setUp();
      const declared = await services.declareAbsence.execute(
        absence('2026-11-24T00:00', '2026-11-25T00:00'),
      );

      const moved = await services.updateAbsence.execute({
        organizationId: ORGANIZATION_A,
        employeeId: INES,
        absenceId: declared.id,
        ...change('2026-11-27T00:00', '2026-11-28T00:00', 'TRAINING'),
      });

      expect(moved.startsAt.toString()).toBe('2026-11-26T23:00:00Z');
      expect(moved.reason).toBe('TRAINING');
      expect(moved.createdAt.equals(declared.createdAt)).toBe(true);
      expect(await absencesOfTheWeek(services)).toEqual([moved]);
    });

    it('refuse une période incohérente et garde l’absence inchangée', async () => {
      const services = await setUp();
      const declared = await services.declareAbsence.execute(
        absence('2026-11-24T00:00', '2026-11-25T00:00'),
      );

      await expect(
        services.updateAbsence.execute({
          organizationId: ORGANIZATION_A,
          employeeId: INES,
          absenceId: declared.id,
          ...change('2026-11-28T00:00', '2026-11-27T00:00'),
        }),
      ).rejects.toThrow(InvalidAbsencePeriodError);
      expect(await absencesOfTheWeek(services)).toEqual([declared]);
    });

    it.each([
      ['inconnue', ORGANIZATION_A, INES, 'unknown'],
      ['d’un autre employé', ORGANIZATION_A, YANIS, 'declared'],
      ['vue d’une autre organisation', ORGANIZATION_B, INES, 'declared'],
    ])(
      'BDD isolation : refuse de modifier une absence %s',
      async (_case, organizationId, employeeId, which) => {
        const services = await setUp();
        const declared = await services.declareAbsence.execute(
          absence('2026-11-24T00:00', '2026-11-25T00:00'),
        );

        await expect(
          services.updateAbsence.execute({
            organizationId,
            employeeId,
            absenceId: which === 'declared' ? declared.id : UNKNOWN_ID,
            ...change('2026-11-27T00:00', '2026-11-28T00:00'),
          }),
        ).rejects.toThrow(AbsenceNotFoundError);
        expect(await absencesOfTheWeek(services)).toEqual([declared]);
      },
    );
  });

  describe('supprimer', () => {
    it('BDD : retire une absence saisie par erreur', async () => {
      const services = await setUp();
      const mistake = await services.declareAbsence.execute(
        absence('2026-11-24T00:00', '2026-11-25T00:00'),
      );

      await services.deleteAbsence.execute({
        organizationId: ORGANIZATION_A,
        employeeId: INES,
        absenceId: mistake.id,
      });

      expect(await absencesOfTheWeek(services)).toEqual([]);
    });

    it('ne retire que l’absence désignée, même si une autre la chevauche', async () => {
      const services = await setUp();
      const leave = await services.declareAbsence.execute(
        absence('2026-11-24T00:00', '2026-11-25T00:00'),
      );
      const sickLeave = await services.declareAbsence.execute(
        absence('2026-11-24T00:00', '2026-11-26T00:00', { reason: 'SICK_LEAVE' }),
      );

      await services.deleteAbsence.execute({
        organizationId: ORGANIZATION_A,
        employeeId: INES,
        absenceId: leave.id,
      });

      expect(await absencesOfTheWeek(services)).toEqual([sickLeave]);
    });

    it.each([
      ['inconnue', ORGANIZATION_A, INES, 'unknown'],
      ['d’un autre employé', ORGANIZATION_A, YANIS, 'declared'],
      ['vue d’une autre organisation', ORGANIZATION_B, INES, 'declared'],
    ])(
      'BDD isolation : refuse de supprimer une absence %s',
      async (_case, organizationId, employeeId, which) => {
        const services = await setUp();
        const declared = await services.declareAbsence.execute(
          absence('2026-11-24T00:00', '2026-11-25T00:00'),
        );

        await expect(
          services.deleteAbsence.execute({
            organizationId,
            employeeId,
            absenceId: which === 'declared' ? declared.id : UNKNOWN_ID,
          }),
        ).rejects.toThrow(AbsenceNotFoundError);
        expect(await absencesOfTheWeek(services)).toEqual([declared]);
      },
    );
  });

  describe('lister les absences d’une semaine', () => {
    it('garde les absences des employés du site qui touchent la semaine, par début', async () => {
      const services = await setUp();
      const thursdayMorning = await services.declareAbsence.execute(
        absence('2026-11-26T06:00', '2026-11-26T10:00', { employeeId: YANIS }),
      );
      const fromLastWeek = await services.declareAbsence.execute(
        absence('2026-11-20T00:00', '2026-11-24T00:00'),
      );
      const intoNextWeek = await services.declareAbsence.execute(
        absence('2026-11-29T22:00', '2026-12-01T00:00', { employeeId: YANIS }),
      );
      await services.declareAbsence.execute(
        absence('2026-11-24T00:00', '2026-11-25T00:00', { employeeId: EMPLOYEE_AT_OTHER_SITE }),
      );

      expect(await absencesOfTheWeek(services)).toEqual([
        fromLastWeek,
        thursdayMorning,
        intoNextWeek,
      ]);
    });

    it('écarte une absence qui finit le lundi à minuit, ou commence le lundi suivant à minuit', async () => {
      const services = await setUp();
      await services.declareAbsence.execute(absence('2026-11-22T00:00', '2026-11-23T00:00'));
      await services.declareAbsence.execute(absence('2026-11-30T00:00', '2026-12-01T00:00'));

      expect(await absencesOfTheWeek(services)).toEqual([]);
    });

    it('refuse une semaine qui ne commence pas un lundi', async () => {
      const services = await setUp();

      await expect(
        absencesOfTheWeek(services, Temporal.PlainDate.from('2026-11-24')),
      ).rejects.toThrow(InvalidWeekStartError);
    });

    it.each([
      ['absent', ORGANIZATION_A, UNKNOWN_ID],
      ['d’une autre organisation', ORGANIZATION_A, SITE_OF_B],
      ['vu d’une autre organisation', ORGANIZATION_B, DEMO_SITE],
    ])(
      'BDD isolation : refuse de lister les absences d’un site %s',
      async (_case, organizationId, siteId) => {
        const services = await setUp();

        await expect(
          services.listWeekAbsences.execute({
            organizationId,
            siteId,
            weekStartsOn: WEEK_OF_23_NOVEMBER,
          }),
        ).rejects.toThrow(SiteNotFoundError);
      },
    );
  });
});
