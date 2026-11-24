import {
  Contract,
  EqualShareReference,
  PlanningReference,
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
import { InMemoryWeekAbsencesSnapshotReader } from '../../testing/in-memory-week-absences-snapshot-reader';
import { SiteNotFoundError } from '../not-found.errors';
import { AbsenceWeekReferenceFreezer } from './absence-week-reference-freezer';
import { DeclareAbsence } from './declare-absence';
import { PendingWeekReferences } from './pending-week-references';
import { PrepareWeekAbsences } from './prepare-week-absences';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const DEMO_SITE = '0190f0a0-0000-7000-8000-0000000000d1';
const CAMILLE = '0190f0a0-0000-7000-8000-0000000000e1';
const FIRST_GENERATION = '0190f0a0-0000-7000-8000-000000000a01';
const LATER_GENERATION = '0190f0a0-0000-7000-8000-000000000a02';
const WEEK_OF_23_NOVEMBER = Temporal.PlainDate.from('2026-11-23');
const WEEK_OF_30_NOVEMBER = Temporal.PlainDate.from('2026-11-30');
const DECLARED_AT = '2026-11-18T15:00:00Z';
const LAUNCHED_AT = '2026-11-20T09:00:00Z';
const HOURS = 60;

function parisInstant(localDateTime: string): Temporal.Instant {
  return Temporal.Instant.from(`${localDateTime}+01:00`);
}

function morningShift(date: string): WorkedShift {
  return {
    startsAt: parisInstant(`${date}T06:00`),
    endsAt: parisInstant(`${date}T13:20`),
    breaks: [{ start: parisInstant(`${date}T10:00`), end: parisInstant(`${date}T10:20`) }],
  };
}

function sixDaysFrom(weekStartsOn: Temporal.PlainDate): Temporal.PlainDate[] {
  return [0, 1, 2, 3, 4, 5].map((offset) => weekStartsOn.add({ days: offset }));
}

async function setUp() {
  const catalog = new InMemoryOrganizationCatalog();
  catalog.addSite(ORGANIZATION_A, DEMO_SITE, 'Europe/Paris');
  const employees = new InMemoryEmployeeRepository();
  await employees.add(anEmployee().withId(CAMILLE).atSite(DEMO_SITE).build());
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
  const freezer = new AbsenceWeekReferenceFreezer(catalog, contracts, references, source);
  const launchClock = new FixedClock(LAUNCHED_AT);
  return {
    source,
    declareAbsence: new DeclareAbsence(
      employees,
      absences,
      freezer,
      new FixedClock(DECLARED_AT),
      new SequentialIdGenerator(),
    ),
    prepare: new PrepareWeekAbsences(
      catalog,
      new InMemoryWeekAbsencesSnapshotReader(absences, references),
      new PendingWeekReferences(employees, freezer, references, launchClock),
    ),
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

function prepareWeek(services: Services, weekStartsOn: Temporal.PlainDate) {
  return services.prepare.execute({
    organizationId: ORGANIZATION_A,
    siteId: DEMO_SITE,
    weekStartsOn,
  });
}

describe('Préparer les absences d’une semaine pour une génération (US-033)', () => {
  it('BDD : besoins ajoutés après la déclaration, la référence se fige au lancement à 4 h 40', async () => {
    const services = await setUp();
    const monday = await declareCamilleAbsent(services, '2026-11-30T00:00', '2026-12-01T00:00');
    services.source.setActivityDays(
      DEMO_SITE,
      WEEK_OF_30_NOVEMBER,
      sixDaysFrom(WEEK_OF_30_NOVEMBER),
    );

    const prepared = await prepareWeek(services, WEEK_OF_30_NOVEMBER);

    expect(prepared.absences).toEqual([monday]);
    expect(prepared.valuations).toHaveLength(1);
    const [camille] = prepared.valuations;
    expect(camille?.valuation).toEqual({ status: 'VALUED', absenceMinutes: 4 * HOURS + 40 });
    expect(camille?.reference).toBeInstanceOf(EqualShareReference);
    expect(camille?.reference?.frozenAt).toEqual(Temporal.Instant.from(LAUNCHED_AT));
  });

  it('garde la référence figée à la déclaration, même si un planning plus récent existe', async () => {
    const services = await setUp();
    services.source.setLatestPlanning(DEMO_SITE, WEEK_OF_23_NOVEMBER, CAMILLE, {
      generationId: FIRST_GENERATION,
      workedShifts: ['2026-11-23', '2026-11-24'].map(morningShift),
    });
    await declareCamilleAbsent(services, '2026-11-24T00:00', '2026-11-25T00:00');
    services.source.setLatestPlanning(DEMO_SITE, WEEK_OF_23_NOVEMBER, CAMILLE, {
      generationId: LATER_GENERATION,
      workedShifts: ['2026-11-23'].map(morningShift),
    });

    const [camille] = (await prepareWeek(services, WEEK_OF_23_NOVEMBER)).valuations;

    expect(camille?.reference).toBeInstanceOf(PlanningReference);
    expect(camille?.reference).toMatchObject({
      generationId: FIRST_GENERATION,
      frozenAt: Temporal.Instant.from(DECLARED_AT),
    });
    expect(camille?.valuation).toEqual({ status: 'VALUED', absenceMinutes: 7 * HOURS });
  });

  it('laisse « à définir » un jour couvert en partie sans durée, référence figée ou non', async () => {
    const services = await setUp();
    services.source.setActivityDays(
      DEMO_SITE,
      WEEK_OF_30_NOVEMBER,
      sixDaysFrom(WEEK_OF_30_NOVEMBER),
    );
    await declareCamilleAbsent(services, '2026-11-30T06:00', '2026-11-30T10:00');

    const [camille] = (await prepareWeek(services, WEEK_OF_30_NOVEMBER)).valuations;

    expect(camille?.valuation).toEqual({
      status: 'TO_DEFINE',
      daysToDefine: [Temporal.PlainDate.from('2026-11-30')],
    });
  });

  it('reste « à définir » sans jour d’activité, et ne fige rien', async () => {
    const services = await setUp();
    await declareCamilleAbsent(services, '2026-11-30T00:00', '2026-12-01T00:00');

    const [camille] = (await prepareWeek(services, WEEK_OF_30_NOVEMBER)).valuations;

    expect(camille).toEqual({
      employeeId: CAMILLE,
      reference: undefined,
      valuation: { status: 'TO_DEFINE', daysToDefine: [] },
    });
  });

  it('rend aussi les absences qui touchent la période demandée hors de la semaine, sans les valoriser', async () => {
    const services = await setUp();
    services.source.setActivityDays(
      DEMO_SITE,
      WEEK_OF_30_NOVEMBER,
      sixDaysFrom(WEEK_OF_30_NOVEMBER),
    );
    const nextMonday = await declareCamilleAbsent(services, '2026-12-07T00:00', '2026-12-07T12:00');

    const prepared = await services.prepare.execute({
      organizationId: ORGANIZATION_A,
      siteId: DEMO_SITE,
      weekStartsOn: WEEK_OF_30_NOVEMBER,
      absencesWithin: {
        start: parisInstant('2026-11-30T00:00'),
        end: parisInstant('2026-12-07T06:00'),
      },
    });

    expect(prepared.absences).toEqual([nextMonday]);
    expect(prepared.valuations).toEqual([]);
  });

  it('BDD isolation : refuse le site d’une autre organisation', async () => {
    const services = await setUp();
    await declareCamilleAbsent(services, '2026-11-24T00:00', '2026-11-25T00:00');

    await expect(
      services.prepare.execute({
        organizationId: ORGANIZATION_B,
        siteId: DEMO_SITE,
        weekStartsOn: WEEK_OF_23_NOVEMBER,
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });
});
