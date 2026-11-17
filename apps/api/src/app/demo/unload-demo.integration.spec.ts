import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { FixedClock } from '@trame/platform/clock';
import { UuidV7Generator } from '@trame/platform/ids';
import { Client } from 'pg';
import { type DemoRows, NO_DEMO_ROWS, countDemoRows } from './demo-rows';
import { type LoadedDemoWarehouse, LoadDemoWarehouse } from './load-demo-warehouse';
import { PrismaDemoUnitOfWork } from './prisma-demo-unit-of-work';

const UNLOAD_SCRIPT = readFileSync(
  resolve(import.meta.dirname, '../../../../../infra/staging/unload-demo.sql'),
  'utf8',
);
const ORGANIZATION_WITH_OWN_SKILL = '0190f0a0-0000-7000-8000-0000000000b1';
const ORGANIZATION_WITH_OTHER_SITE = '0190f0a0-0000-7000-8000-0000000000b2';
const ORGANIZATION_OWNER = '0190f0a0-0000-7000-8000-0000000000b3';
const ORGANIZATION_MISTAKEN = '0190f0a0-0000-7000-8000-0000000000b4';
const ORGANIZATION_WITHOUT_DEMO = '0190f0a0-0000-7000-8000-0000000000b5';
const CREATED_AT = new Date('2026-11-16T08:00:00Z');

/** Ce que le jeu remplit dans une organisation qui n'avait rien. */
const LOADED_ROWS: DemoRows = {
  sites: 1,
  skills: 3,
  positions: 3,
  positionSkills: 4,
  shiftTemplates: 2,
  employees: 12,
  employeeQualifications: 15,
  contracts: 12,
  weeklyCoverages: 1,
  coverageNeeds: 26,
};

describe('retrait du jeu de démonstration (infra/staging/unload-demo.sql)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  const clock = new FixedClock('2026-11-17T08:00:00Z');
  const ids = new UuidV7Generator(clock);

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  function load(organizationId: string): Promise<LoadedDemoWarehouse> {
    const unitOfWork = new PrismaDemoUnitOfWork(prisma, clock, ids);
    return new LoadDemoWarehouse(unitOfWork, clock).execute(organizationId);
  }

  /** Comme le runbook : paramètres de session passés par les options de connexion. */
  async function unload(organizationId: string, siteId: string): Promise<void> {
    const client = new Client({
      connectionString: database.url,
      options: `-c trame.demo_organization=${organizationId} -c trame.demo_site=${siteId}`,
    });
    await client.connect();
    try {
      await client.query(UNLOAD_SCRIPT);
    } finally {
      await client.end();
    }
  }

  async function addSkill(organizationId: string, name: string): Promise<string> {
    const id = ids.next();
    await prisma.skill.create({ data: { id, organizationId, name, createdAt: CREATED_AT } });
    return id;
  }

  async function addSite(organizationId: string, code: string): Promise<string> {
    const id = ids.next();
    await prisma.site.create({
      data: {
        id,
        organizationId,
        code,
        name: code,
        timeZone: 'Europe/Paris',
        createdAt: CREATED_AT,
      },
    });
    return id;
  }

  it('retire le jeu chargé et lui seul : une compétence antérieure au chargement reste', async () => {
    const ownSkillId = await addSkill(ORGANIZATION_WITH_OWN_SKILL, 'Habilitation électrique B0');
    const loaded = await load(ORGANIZATION_WITH_OWN_SKILL);
    await prisma.scheduleGeneration.create({
      data: {
        id: ids.next(),
        organizationId: ORGANIZATION_WITH_OWN_SKILL,
        siteId: loaded.siteId,
        weekStartsOn: new Date('2026-11-23T00:00:00Z'),
        idempotencyKey: 'demo-unload',
        status: 'QUEUED',
        problem: {},
        parameters: {},
        excludedEmployees: [],
        createdAt: CREATED_AT,
      },
    });

    await unload(ORGANIZATION_WITH_OWN_SKILL, loaded.siteId);

    await expect(countDemoRows(prisma, ORGANIZATION_WITH_OWN_SKILL)).resolves.toEqual({
      ...NO_DEMO_ROWS,
      skills: 1,
    });
    const remaining = await prisma.skill.findMany({
      where: { organizationId: ORGANIZATION_WITH_OWN_SKILL },
    });
    expect(remaining.map((skill) => skill.id)).toEqual([ownSkillId]);
    const generations = await prisma.scheduleGeneration.count({
      where: { organizationId: ORGANIZATION_WITH_OWN_SKILL },
    });
    expect(generations).toBe(0);
  });

  it('garde une compétence du jeu encore utilisée hors du site de démonstration', async () => {
    const loaded = await load(ORGANIZATION_WITH_OTHER_SITE);
    const otherSiteId = await addSite(ORGANIZATION_WITH_OTHER_SITE, 'NORD');
    const caces1A = await prisma.skill.findFirstOrThrow({
      where: { organizationId: ORGANIZATION_WITH_OTHER_SITE, name: 'CACES R489 catégorie 1A' },
    });
    const employeeId = ids.next();
    await prisma.employee.create({
      data: {
        id: employeeId,
        organizationId: ORGANIZATION_WITH_OTHER_SITE,
        siteId: otherSiteId,
        firstName: 'Salarié',
        lastName: 'Nord',
        createdAt: CREATED_AT,
      },
    });
    await prisma.employeeQualification.create({
      data: {
        organizationId: ORGANIZATION_WITH_OTHER_SITE,
        employeeId,
        skillId: caces1A.id,
        expiresOn: null,
      },
    });

    await unload(ORGANIZATION_WITH_OTHER_SITE, loaded.siteId);

    await expect(countDemoRows(prisma, ORGANIZATION_WITH_OTHER_SITE)).resolves.toEqual({
      ...NO_DEMO_ROWS,
      sites: 1,
      skills: 1,
      employees: 1,
      employeeQualifications: 1,
    });
  });

  it('refuse, sans rien supprimer, un site de démonstration d’une autre organisation', async () => {
    const loaded = await load(ORGANIZATION_OWNER);
    await load(ORGANIZATION_MISTAKEN);

    await expect(unload(ORGANIZATION_MISTAKEN, loaded.siteId)).rejects.toThrow(
      'Aucun site de démonstration',
    );

    await expect(countDemoRows(prisma, ORGANIZATION_OWNER)).resolves.toEqual(LOADED_ROWS);
    await expect(countDemoRows(prisma, ORGANIZATION_MISTAKEN)).resolves.toEqual(LOADED_ROWS);
  });

  it('refuse, sans rien supprimer, un site qui n’est pas celui de démonstration', async () => {
    const siteId = await addSite(ORGANIZATION_WITHOUT_DEMO, 'NORD');
    await addSkill(ORGANIZATION_WITHOUT_DEMO, 'CACES R489 catégorie 3');

    await expect(unload(ORGANIZATION_WITHOUT_DEMO, siteId)).rejects.toThrow(
      'Aucun site de démonstration',
    );

    await expect(countDemoRows(prisma, ORGANIZATION_WITHOUT_DEMO)).resolves.toEqual({
      ...NO_DEMO_ROWS,
      sites: 1,
      skills: 1,
    });
  });
});
