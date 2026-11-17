import { PrismaService, DatabaseContext } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { aWeeklyCoverage } from '@trame/api/demand/application/testing';
import type { WeeklyCoverage } from '@trame/api/demand/domain';
import { PrismaWeeklyCoverageRepository } from './prisma-weekly-coverage.repository';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const WAREHOUSE = '0190f0a0-0000-7000-8000-0000000000d1';
const MORNING = '0190f0a0-0000-7000-8000-0000000000a1';
const AFTERNOON = '0190f0a0-0000-7000-8000-0000000000a2';
const FORKLIFT_DRIVER = '0190f0a0-0000-7000-8000-0000000000b1';
const ORDER_PICKER = '0190f0a0-0000-7000-8000-0000000000b2';
const MONDAY = Temporal.PlainDate.from('2026-11-16');
const NEXT_MONDAY = Temporal.PlainDate.from('2026-11-23');

function describeNeeds(coverage: WeeklyCoverage | undefined): string[] {
  if (coverage === undefined) {
    return [];
  }
  return coverage.needs.map(
    (need) =>
      `${need.date.toString()} ${need.shiftTemplateId} ${need.positionId} ${need.requiredCount}`,
  );
}

describe('besoins de couverture sur PostgreSQL (US-050, jalon 1)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let coverages: PrismaWeeklyCoverageRepository;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
    const context = new DatabaseContext(prisma);
    coverages = new PrismaWeeklyCoverageRepository(context);
  }, 120_000);

  beforeEach(async () => {
    // Cette base est propre au fichier ; les autres suites ont leur propre base migrée.
    await prisma.coverageNeed.deleteMany();
    await prisma.weeklyCoverage.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  it('enregistre les besoins d’une semaine et les relit, triés', async () => {
    const coverage = aWeeklyCoverage()
      .needing(3, '2026-11-21', MORNING, FORKLIFT_DRIVER)
      .needing(2, '2026-11-16', AFTERNOON, ORDER_PICKER)
      .build();
    await coverages.save(coverage);

    const read = await coverages.find(ORGANIZATION_A, WAREHOUSE, MONDAY);

    expect(read?.weekStartsOn.toString()).toBe('2026-11-16');
    expect(read?.updatedAt.equals(coverage.updatedAt)).toBe(true);
    expect(describeNeeds(read)).toEqual([
      `2026-11-16 ${AFTERNOON} ${ORDER_PICKER} 2`,
      `2026-11-21 ${MORNING} ${FORKLIFT_DRIVER} 3`,
    ]);
  });

  it('ne renvoie rien pour une semaine jamais définie', async () => {
    expect(await coverages.find(ORGANIZATION_A, WAREHOUSE, MONDAY)).toBeUndefined();
  });

  it('remplace entièrement les besoins de la semaine, sans toucher la suivante', async () => {
    await coverages.save(
      aWeeklyCoverage().needing(3, '2026-11-21', MORNING, FORKLIFT_DRIVER).build(),
    );
    await coverages.save(
      aWeeklyCoverage()
        .forWeekOf('2026-11-23')
        .needing(1, '2026-11-23', MORNING, FORKLIFT_DRIVER)
        .build(),
    );

    await coverages.save(
      aWeeklyCoverage().needing(5, '2026-11-18', AFTERNOON, ORDER_PICKER).build(),
    );

    expect(describeNeeds(await coverages.find(ORGANIZATION_A, WAREHOUSE, MONDAY))).toEqual([
      `2026-11-18 ${AFTERNOON} ${ORDER_PICKER} 5`,
    ]);
    expect(describeNeeds(await coverages.find(ORGANIZATION_A, WAREHOUSE, NEXT_MONDAY))).toEqual([
      `2026-11-23 ${MORNING} ${FORKLIFT_DRIVER} 1`,
    ]);
  });

  it('garde une semaine définie sans besoin', async () => {
    await coverages.save(aWeeklyCoverage().build());

    const read = await coverages.find(ORGANIZATION_A, WAREHOUSE, MONDAY);

    expect(read).toBeDefined();
    expect(describeNeeds(read)).toEqual([]);
  });

  it('BDD isolation : ne lit pas les besoins depuis une autre organisation', async () => {
    await coverages.save(
      aWeeklyCoverage().needing(3, '2026-11-21', MORNING, FORKLIFT_DRIVER).build(),
    );

    expect(await coverages.find(ORGANIZATION_B, WAREHOUSE, MONDAY)).toBeUndefined();
  });

  it('garde en entier l’une de deux définitions simultanées de la même semaine', async () => {
    const first = aWeeklyCoverage()
      .needing(1, '2026-11-16', MORNING, FORKLIFT_DRIVER)
      .needing(1, '2026-11-17', MORNING, FORKLIFT_DRIVER)
      .build();
    const second = aWeeklyCoverage()
      .needing(9, '2026-11-17', MORNING, FORKLIFT_DRIVER)
      .needing(9, '2026-11-18', AFTERNOON, ORDER_PICKER)
      .build();

    await Promise.all([coverages.save(first), coverages.save(second)]);

    const kept = describeNeeds(await coverages.find(ORGANIZATION_A, WAREHOUSE, MONDAY));
    expect([describeNeeds(first), describeNeeds(second)]).toContainEqual(kept);
  });

  it('la migration interdit une semaine qui ne commence pas un lundi', async () => {
    await expect(prisma.$executeRaw`
      INSERT INTO demand.weekly_coverages (organization_id, site_id, week_starts_on, updated_at)
      VALUES (${ORGANIZATION_A}::uuid, ${WAREHOUSE}::uuid, '2026-11-17', '2026-11-15T08:00:00Z')
    `).rejects.toThrow();
  });

  it.each([
    ['un besoin hors de sa semaine', '2026-11-23', 1],
    ['un besoin sans personne requise', '2026-11-16', 0],
  ])('la migration interdit %s', async (_case, date, requiredCount) => {
    await coverages.save(aWeeklyCoverage().build());

    await expect(prisma.$executeRaw`
      INSERT INTO demand.coverage_needs
        (organization_id, site_id, week_starts_on, date, shift_template_id, position_id, required_count)
      VALUES
        (${ORGANIZATION_A}::uuid, ${WAREHOUSE}::uuid, '2026-11-16', ${date}::date,
         ${MORNING}::uuid, ${FORKLIFT_DRIVER}::uuid, ${requiredCount})
    `).rejects.toThrow();
  });
});
