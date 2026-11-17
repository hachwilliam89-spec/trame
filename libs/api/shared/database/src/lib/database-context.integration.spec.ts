import { type TestDatabase, startTestDatabase } from '../testing/test-database';
import { DatabaseContext } from './database-context';
import { PrismaService } from './prisma.service';

const ORGANIZATION = '0190f0a0-0000-7000-8000-00000000000a';
const WAREHOUSE = '0190f0a0-0000-7000-8000-0000000000d1';
const SECOND_WAREHOUSE = '0190f0a0-0000-7000-8000-0000000000d2';
const EMPLOYEE = '0190f0a0-0000-7000-8000-0000000000e1';
const SECOND_EMPLOYEE = '0190f0a0-0000-7000-8000-0000000000e2';
const CREATED_AT = new Date('2026-11-16T08:00:00Z');
const MONDAY = new Date('2026-11-23T00:00:00Z');

class LateFailure extends Error {}

describe('unité de travail sur PostgreSQL (ADR-0038)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let context: DatabaseContext;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
    context = new DatabaseContext(prisma);
  }, 120_000);

  beforeEach(async () => {
    await prisma.weeklyCoverage.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.site.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  /** Écrit une ligne dans chacun des schémas `organization`, `staff` et `demand`. */
  async function writeInThreeSchemas(siteId: string, employeeId: string): Promise<void> {
    await context.client.site.create({
      data: {
        id: siteId,
        organizationId: ORGANIZATION,
        code: siteId.slice(-4),
        name: 'Entrepôt',
        timeZone: 'Europe/Paris',
        createdAt: CREATED_AT,
      },
    });
    await context.client.employee.create({
      data: {
        id: employeeId,
        organizationId: ORGANIZATION,
        siteId,
        firstName: 'Camille',
        lastName: 'Laurent',
        createdAt: CREATED_AT,
      },
    });
    await context.client.weeklyCoverage.create({
      data: { organizationId: ORGANIZATION, siteId, weekStartsOn: MONDAY, updatedAt: CREATED_AT },
    });
  }

  async function rowCounts(): Promise<{ sites: number; employees: number; coverages: number }> {
    return {
      sites: await prisma.site.count(),
      employees: await prisma.employee.count(),
      coverages: await prisma.weeklyCoverage.count(),
    };
  }

  it('valide ensemble les écritures faites dans les trois schémas', async () => {
    await context.atomically(() => writeInThreeSchemas(WAREHOUSE, EMPLOYEE));

    expect(await rowCounts()).toEqual({ sites: 1, employees: 1, coverages: 1 });
  });

  it('annule les écritures des trois schémas quand une erreur survient après elles', async () => {
    const work = context.atomically(async () => {
      await writeInThreeSchemas(WAREHOUSE, EMPLOYEE);
      throw new LateFailure();
    });

    await expect(work).rejects.toBeInstanceOf(LateFailure);
    expect(await rowCounts()).toEqual({ sites: 0, employees: 0, coverages: 0 });
  });

  it("lit, dans l'unité de travail, ce qu'elle a déjà écrit", async () => {
    const seenInside = await context.atomically(async () => {
      await writeInThreeSchemas(WAREHOUSE, EMPLOYEE);
      return context.client.employee.count({ where: { siteId: WAREHOUSE } });
    });

    expect(seenInside).toBe(1);
  });

  it("une transaction de dépôt rejoint l'unité de travail en cours", async () => {
    const work = context.atomically(async () => {
      await writeInThreeSchemas(WAREHOUSE, EMPLOYEE);
      await context.transaction((transaction) =>
        transaction.employee.update({ where: { id: EMPLOYEE }, data: { firstName: 'Inès' } }),
      );
      throw new LateFailure();
    });

    await expect(work).rejects.toBeInstanceOf(LateFailure);
    expect(await rowCounts()).toEqual({ sites: 0, employees: 0, coverages: 0 });
  });

  it('hors unité de travail, une transaction de dépôt est validée seule, ou annulée seule', async () => {
    await context.transaction((transaction) => writeSiteWith(transaction, WAREHOUSE));
    const failing = context.transaction(async (transaction) => {
      await writeSiteWith(transaction, SECOND_WAREHOUSE);
      throw new LateFailure();
    });

    await expect(failing).rejects.toBeInstanceOf(LateFailure);
    expect(await prisma.site.findMany({ select: { id: true } })).toEqual([{ id: WAREHOUSE }]);
  });

  it('deux unités de travail simultanées restent séparées', async () => {
    let releaseFailingWork: () => void = () => undefined;
    const failingWorkMayFail = new Promise<void>((resolve) => {
      releaseFailingWork = resolve;
    });

    const failing = context.atomically(async () => {
      await writeInThreeSchemas(WAREHOUSE, EMPLOYEE);
      await failingWorkMayFail;
      throw new LateFailure();
    });
    const succeeding = context.atomically(async () => {
      await writeInThreeSchemas(SECOND_WAREHOUSE, SECOND_EMPLOYEE);
      releaseFailingWork();
    });

    await expect(failing).rejects.toBeInstanceOf(LateFailure);
    await succeeding;
    expect(await prisma.employee.findMany({ select: { id: true } })).toEqual([
      { id: SECOND_EMPLOYEE },
    ]);
  });
});

async function writeSiteWith(
  transaction: DatabaseContext['client'],
  siteId: string,
): Promise<void> {
  await transaction.site.create({
    data: {
      id: siteId,
      organizationId: ORGANIZATION,
      code: siteId.slice(-4),
      name: 'Entrepôt',
      timeZone: 'Europe/Paris',
      createdAt: CREATED_AT,
    },
  });
}
