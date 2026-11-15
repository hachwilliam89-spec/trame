import {
  type CoverageNeed,
  InvalidRequiredCountError,
  InvalidWeekStartError,
} from '@trame/api/demand/domain';
import { FixedClock } from '@trame/platform/clock';
import { InMemorySiteCatalog } from '../../testing/in-memory-site-catalog';
import { InMemoryWeeklyCoverageRepository } from '../../testing/in-memory-weekly-coverage.repository';
import {
  PositionNotFoundError,
  ShiftTemplateNotFoundError,
  SiteNotFoundError,
} from '../not-found.errors';
import { DefineWeeklyCoverage, type DefineWeeklyCoverageCommand } from './define-weekly-coverage';
import { GetWeeklyCoverage } from './get-weekly-coverage';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const WAREHOUSE = '0190f0a0-0000-7000-8000-0000000000d1';
const SECOND_SITE = '0190f0a0-0000-7000-8000-0000000000d2';
const MORNING = '0190f0a0-0000-7000-8000-0000000000a1';
const MORNING_OF_SECOND_SITE = '0190f0a0-0000-7000-8000-0000000000a9';
const FORKLIFT_DRIVER = '0190f0a0-0000-7000-8000-0000000000b1';
const POSITION_OF_SECOND_SITE = '0190f0a0-0000-7000-8000-0000000000b9';
const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';
const MONDAY = Temporal.PlainDate.from('2026-11-16');
const NEXT_MONDAY = Temporal.PlainDate.from('2026-11-23');
const now = Temporal.Instant.from('2026-11-15T08:00:00Z');

function setUp() {
  const catalog = new InMemorySiteCatalog();
  catalog.addSite(ORGANIZATION_A, WAREHOUSE);
  catalog.addShiftTemplate(ORGANIZATION_A, WAREHOUSE, MORNING);
  catalog.addPosition(ORGANIZATION_A, WAREHOUSE, FORKLIFT_DRIVER);
  catalog.addSite(ORGANIZATION_A, SECOND_SITE);
  catalog.addShiftTemplate(ORGANIZATION_A, SECOND_SITE, MORNING_OF_SECOND_SITE);
  catalog.addPosition(ORGANIZATION_A, SECOND_SITE, POSITION_OF_SECOND_SITE);
  const coverages = new InMemoryWeeklyCoverageRepository();
  return {
    defineWeeklyCoverage: new DefineWeeklyCoverage(catalog, coverages, new FixedClock(now)),
    getWeeklyCoverage: new GetWeeklyCoverage(catalog, coverages),
  };
}

function need(date: string, overrides: Partial<CoverageNeed> = {}): CoverageNeed {
  return {
    date: Temporal.PlainDate.from(date),
    shiftTemplateId: MORNING,
    positionId: FORKLIFT_DRIVER,
    requiredCount: 2,
    ...overrides,
  };
}

function weekOfWarehouse(
  overrides: Partial<DefineWeeklyCoverageCommand> = {},
): DefineWeeklyCoverageCommand {
  return {
    organizationId: ORGANIZATION_A,
    siteId: WAREHOUSE,
    weekStartsOn: MONDAY,
    needs: [need('2026-11-16'), need('2026-11-21', { requiredCount: 3 })],
    ...overrides,
  };
}

type Services = ReturnType<typeof setUp>;

async function readWeekOfWarehouse(services: Services, weekStartsOn = MONDAY) {
  return services.getWeeklyCoverage.execute({
    organizationId: ORGANIZATION_A,
    siteId: WAREHOUSE,
    weekStartsOn,
  });
}

describe('cas d’usage des besoins de couverture (US-050)', () => {
  it('définit les besoins d’une semaine et les relit, datés par l’horloge', async () => {
    const services = setUp();

    const defined = await services.defineWeeklyCoverage.execute(weekOfWarehouse());

    expect(defined.updatedAt.equals(now)).toBe(true);
    expect(defined.needs.map((coverageNeed) => coverageNeed.requiredCount)).toEqual([2, 3]);
    expect(await readWeekOfWarehouse(services)).toBe(defined);
  });

  it('remplace entièrement les besoins déjà définis pour la semaine', async () => {
    const services = setUp();
    await services.defineWeeklyCoverage.execute(weekOfWarehouse());

    await services.defineWeeklyCoverage.execute(
      weekOfWarehouse({ needs: [need('2026-11-18', { requiredCount: 5 })] }),
    );

    const read = await readWeekOfWarehouse(services);
    expect(read?.needs.map((coverageNeed) => coverageNeed.date.toString())).toEqual(['2026-11-18']);
  });

  it('ne touche ni une autre semaine ni un autre site', async () => {
    const services = setUp();
    const nextWeek = await services.defineWeeklyCoverage.execute(
      weekOfWarehouse({ weekStartsOn: NEXT_MONDAY, needs: [need('2026-11-23')] }),
    );

    await services.defineWeeklyCoverage.execute(weekOfWarehouse({ needs: [] }));

    expect(await readWeekOfWarehouse(services, NEXT_MONDAY)).toBe(nextWeek);
    expect(
      await services.getWeeklyCoverage.execute({
        organizationId: ORGANIZATION_A,
        siteId: SECOND_SITE,
        weekStartsOn: MONDAY,
      }),
    ).toBeUndefined();
  });

  it('ne renvoie rien pour une semaine jamais définie', async () => {
    const services = setUp();

    expect(await readWeekOfWarehouse(services)).toBeUndefined();
  });

  it.each([
    ['absent', ORGANIZATION_A, UNKNOWN_ID],
    ['d’une autre organisation', ORGANIZATION_B, WAREHOUSE],
  ])(
    'BDD isolation : refuse de définir ou de lire les besoins d’un site %s',
    async (_case, organizationId, siteId) => {
      const services = setUp();
      await services.defineWeeklyCoverage.execute(weekOfWarehouse());

      await expect(
        services.defineWeeklyCoverage.execute(weekOfWarehouse({ organizationId, siteId })),
      ).rejects.toThrow(SiteNotFoundError);
      await expect(
        services.getWeeklyCoverage.execute({ organizationId, siteId, weekStartsOn: MONDAY }),
      ).rejects.toThrow(SiteNotFoundError);
    },
  );

  it.each([
    ['absent', UNKNOWN_ID],
    ['d’un autre site', MORNING_OF_SECOND_SITE],
  ])(
    'refuse un créneau type %s, sans rien enregistrer (US-050)',
    async (_case, shiftTemplateId) => {
      const services = setUp();
      const command = weekOfWarehouse({ needs: [need('2026-11-16', { shiftTemplateId })] });

      await expect(services.defineWeeklyCoverage.execute(command)).rejects.toThrow(
        ShiftTemplateNotFoundError,
      );
      expect(await readWeekOfWarehouse(services)).toBeUndefined();
    },
  );

  it.each([
    ['absent', UNKNOWN_ID],
    ['d’un autre site', POSITION_OF_SECOND_SITE],
  ])('refuse un poste %s, sans rien enregistrer', async (_case, positionId) => {
    const services = setUp();
    const command = weekOfWarehouse({ needs: [need('2026-11-16', { positionId })] });

    await expect(services.defineWeeklyCoverage.execute(command)).rejects.toThrow(
      PositionNotFoundError,
    );
    expect(await readWeekOfWarehouse(services)).toBeUndefined();
  });

  it('applique les règles du domaine avant d’enregistrer', async () => {
    const services = setUp();
    const command = weekOfWarehouse({ needs: [need('2026-11-16', { requiredCount: 0 })] });

    await expect(services.defineWeeklyCoverage.execute(command)).rejects.toThrow(
      InvalidRequiredCountError,
    );
    expect(await readWeekOfWarehouse(services)).toBeUndefined();
  });

  it('refuse de lire une semaine qui ne commence pas un lundi', async () => {
    const services = setUp();

    await expect(
      readWeekOfWarehouse(services, Temporal.PlainDate.from('2026-11-17')),
    ).rejects.toThrow(InvalidWeekStartError);
  });
});
