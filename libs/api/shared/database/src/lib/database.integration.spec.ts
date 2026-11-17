import { randomUUID } from 'node:crypto';
import { type TestDatabase, startTestDatabase } from '../testing/test-database';
import { type DatabaseClient, PrismaDatabase, runAtomically } from './database';
import { PrismaService } from './prisma.service';

const OPTIONS = { timeoutMs: 10_000 };
const CREATED_AT = new Date('2026-11-17T08:00:00Z');

class LatePanic extends Error {
  constructor() {
    super('Panne après la dernière écriture');
  }
}

async function addSite(client: DatabaseClient, organizationId: string): Promise<void> {
  await client.site.create({
    data: {
      id: randomUUID(),
      organizationId,
      code: 'DEMO',
      name: 'Entrepôt',
      timeZone: 'Europe/Paris',
      createdAt: CREATED_AT,
    },
  });
}

async function addSkill(client: DatabaseClient, organizationId: string): Promise<void> {
  await client.skill.create({
    data: { id: randomUUID(), organizationId, name: 'CACES R489 cat. 3', createdAt: CREATED_AT },
  });
}

describe('unité de travail sur PostgreSQL (ADR-0038)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  async function rowsOf(organizationId: string): Promise<{ sites: number; skills: number }> {
    const sites = await prisma.site.count({ where: { organizationId } });
    const skills = await prisma.skill.count({ where: { organizationId } });
    return { sites, skills };
  }

  it('valide les écritures quand le travail aboutit', async () => {
    const organizationId = randomUUID();

    await runAtomically(prisma, OPTIONS, async (unit) => {
      await addSite(unit.client, organizationId);
      await addSkill(unit.client, organizationId);
    });

    await expect(rowsOf(organizationId)).resolves.toEqual({ sites: 1, skills: 1 });
  });

  it('annule toutes les écritures quand une erreur survient après la dernière', async () => {
    const organizationId = randomUUID();

    const work = runAtomically(prisma, OPTIONS, async (unit) => {
      await addSite(unit.client, organizationId);
      await addSkill(unit.client, organizationId);
      throw new LatePanic();
    });

    await expect(work).rejects.toThrow(LatePanic);
    await expect(rowsOf(organizationId)).resolves.toEqual({ sites: 0, skills: 0 });
  });

  it("une transaction demandée dans l'unité la rejoint, et l'erreur de l'unité l'annule", async () => {
    const organizationId = randomUUID();

    const work = runAtomically(prisma, OPTIONS, async (unit) => {
      await unit.transaction(async (client) => {
        await addSite(client, organizationId);
        await addSkill(client, organizationId);
      });
      throw new LatePanic();
    });

    await expect(work).rejects.toThrow(LatePanic);
    await expect(rowsOf(organizationId)).resolves.toEqual({ sites: 0, skills: 0 });
  });

  it("les lectures de l'unité voient ses écritures, que le reste de l'application ne voit pas encore", async () => {
    const organizationId = randomUUID();

    const seen = await runAtomically(prisma, OPTIONS, async (unit) => {
      await addSite(unit.client, organizationId);
      const byUnit = await unit.client.site.count({ where: { organizationId } });
      const byApplication = await prisma.site.count({ where: { organizationId } });
      return { byUnit, byApplication };
    });

    expect(seen).toEqual({ byUnit: 1, byApplication: 0 });
  });

  it("hors unité de travail, l'erreur d'une transaction n'annule que ses écritures", async () => {
    const organizationId = randomUUID();
    const application = new PrismaDatabase(prisma);
    await addSite(application.client, organizationId);

    const failingTransaction = application.transaction(async (client) => {
      await addSkill(client, organizationId);
      throw new LatePanic();
    });

    await expect(failingTransaction).rejects.toThrow(LatePanic);
    await expect(rowsOf(organizationId)).resolves.toEqual({ sites: 1, skills: 0 });
  });
});
