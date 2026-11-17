import { PrismaService } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { FixedClock } from '@trame/platform/clock';
import { type IdGenerator, UuidV7Generator } from '@trame/platform/ids';
import { DemoAlreadyLoadedError, LoadDemoWarehouse } from './load-demo-warehouse';
import { PrismaDemoUnitOfWork } from './prisma-demo-unit-of-work';

const ORGANIZATION_EMPTY = '0190f0a0-0000-7000-8000-0000000000a1';
const ORGANIZATION_WITH_SITE = '0190f0a0-0000-7000-8000-0000000000a2';
const ORGANIZATION_A = '0190f0a0-0000-7000-8000-0000000000a3';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-0000000000a4';
const ORGANIZATION_FAILING = '0190f0a0-0000-7000-8000-0000000000a5';
const ORGANIZATION_RACED = '0190f0a0-0000-7000-8000-0000000000a6';

/**
 * Donne au sixième salarié (20ᵉ identifiant) celui du premier (10ᵉ) : son insertion viole la clé
 * primaire après dix-neuf écritures dans les trois contextes.
 */
class RepeatingIdGenerator implements IdGenerator {
  private readonly given: string[] = [];

  constructor(private readonly ids: IdGenerator) {}

  next(): string {
    const id = this.given.length === 19 ? this.given[9] : this.ids.next();
    if (id === undefined) {
      throw new Error('Moins de dix identifiants donnés.');
    }
    this.given.push(id);
    return id;
  }
}

describe('chargement du jeu de démonstration sur PostgreSQL', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  // Mardi 17 novembre 2026 à Paris : la semaine de démonstration commence le lundi 23.
  const clock = new FixedClock('2026-11-17T08:00:00Z');

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  function loader(ids: IdGenerator = new UuidV7Generator(clock)): LoadDemoWarehouse {
    return new LoadDemoWarehouse(new PrismaDemoUnitOfWork(prisma, clock, ids), clock);
  }

  /** Lignes de l'organisation dans chaque table que le chargement remplit. */
  async function rowsOf(organizationId: string): Promise<Record<string, number>> {
    const where = { where: { organizationId } };
    return {
      sites: await prisma.site.count(where),
      skills: await prisma.skill.count(where),
      positions: await prisma.position.count(where),
      positionSkills: await prisma.positionSkill.count(where),
      shiftTemplates: await prisma.shiftTemplate.count(where),
      employees: await prisma.employee.count(where),
      employeeQualifications: await prisma.employeeQualification.count(where),
      contracts: await prisma.contract.count(where),
      weeklyCoverages: await prisma.weeklyCoverage.count(where),
      coverageNeeds: await prisma.coverageNeed.count(where),
    };
  }

  const EMPTY = {
    sites: 0,
    skills: 0,
    positions: 0,
    positionSkills: 0,
    shiftTemplates: 0,
    employees: 0,
    employeeQualifications: 0,
    contracts: 0,
    weeklyCoverages: 0,
    coverageNeeds: 0,
  };

  it('remplit une organisation vide et rend le site et le lundi suivant', async () => {
    const loaded = await loader().execute(ORGANIZATION_EMPTY);

    expect(loaded.weekStartsOn).toEqual(Temporal.PlainDate.from('2026-11-23'));
    const site = await prisma.site.findFirst({ where: { organizationId: ORGANIZATION_EMPTY } });
    expect(site?.id).toBe(loaded.siteId);
    await expect(rowsOf(ORGANIZATION_EMPTY)).resolves.toEqual({
      sites: 1,
      skills: 3,
      positions: 3,
      // Cariste : CACES 3 et 5 ; préparateur et réceptionnaire : CACES 1A.
      positionSkills: 4,
      shiftTemplates: 2,
      employees: 12,
      // Trois caristes à deux CACES, neuf salariés à un seul.
      employeeQualifications: 15,
      contracts: 12,
      weeklyCoverages: 1,
      coverageNeeds: 26,
    });
    const places = await prisma.coverageNeed.aggregate({
      where: { organizationId: ORGANIZATION_EMPTY },
      _sum: { requiredCount: true },
    });
    expect(places._sum.requiredCount).toBe(51);
  });

  it('refuse sans rien modifier quand l’organisation a déjà un site', async () => {
    await prisma.site.create({
      data: {
        id: '0190f0a0-0000-7000-8000-0000000000e1',
        organizationId: ORGANIZATION_WITH_SITE,
        code: 'NORD',
        name: 'Entrepôt nord',
        timeZone: 'Europe/Paris',
        createdAt: new Date('2026-11-16T08:00:00Z'),
      },
    });

    await expect(loader().execute(ORGANIZATION_WITH_SITE)).rejects.toThrow(DemoAlreadyLoadedError);

    await expect(rowsOf(ORGANIZATION_WITH_SITE)).resolves.toEqual({ ...EMPTY, sites: 1 });
  });

  it('isole deux organisations chargées l’une après l’autre', async () => {
    const loadedA = await loader().execute(ORGANIZATION_A);
    const loadedB = await loader().execute(ORGANIZATION_B);

    expect((await rowsOf(ORGANIZATION_A)).employees).toBe(12);
    expect((await rowsOf(ORGANIZATION_B)).employees).toBe(12);
    const siteOfBSeenByA = await prisma.site.findFirst({
      where: { organizationId: ORGANIZATION_A, id: loadedB.siteId },
    });
    expect(siteOfBSeenByA).toBeNull();
    expect(loadedA.siteId).not.toBe(loadedB.siteId);
  });

  it('annule tout le chargement quand une écriture échoue en cours de route', async () => {
    const failing = loader(new RepeatingIdGenerator(new UuidV7Generator(clock)));

    await expect(failing.execute(ORGANIZATION_FAILING)).rejects.toThrow();

    await expect(rowsOf(ORGANIZATION_FAILING)).resolves.toEqual(EMPTY);
  });

  it('deux lancements simultanés : un chargement, un refus, un seul site', async () => {
    const results = await Promise.allSettled([
      loader().execute(ORGANIZATION_RACED),
      loader().execute(ORGANIZATION_RACED),
    ]);

    const loaded = results.filter((result) => result.status === 'fulfilled');
    const refused = results.filter((result) => result.status === 'rejected');
    expect(loaded).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0]?.reason).toBeInstanceOf(DemoAlreadyLoadedError);
    expect((await rowsOf(ORGANIZATION_RACED)).sites).toBe(1);
  });
});
