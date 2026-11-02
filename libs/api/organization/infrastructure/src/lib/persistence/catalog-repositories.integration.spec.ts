import { PrismaService, instantToDate } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { PositionReferenceNotFoundError } from '@trame/api/organization/application';
import {
  Position,
  Skill,
  SkillInUseError,
  Site,
  SiteCode,
  TimeZone,
} from '@trame/api/organization/domain';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { ORGANIZATION_A, ORGANIZATION_B } from '../../testing';
import { PrismaPositionRepository } from './prisma-position.repository';
import { PrismaSiteRepository } from './prisma-site.repository';
import { PrismaSkillRepository } from './prisma-skill.repository';

const createdAt = Temporal.Instant.from('2026-11-02T08:00:00.123Z');

describe('catalogue et postes sur PostgreSQL (US-030 B)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let sites: PrismaSiteRepository;
  let skills: PrismaSkillRepository;
  let positions: PrismaPositionRepository;
  let ids: SequentialIdGenerator;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
    sites = new PrismaSiteRepository(prisma);
    skills = new PrismaSkillRepository(prisma);
    positions = new PrismaPositionRepository(prisma);
  }, 120_000);

  beforeEach(async () => {
    // Cette base est propre au fichier ; les autres suites ont leur propre base migrée.
    await prisma.positionSkill.deleteMany();
    await prisma.position.deleteMany();
    await prisma.skill.deleteMany();
    await prisma.site.deleteMany();
    ids = new SequentialIdGenerator();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  it('la migration permet de stocker une compétence du catalogue', async () => {
    const skillId = '0190f0a0-0000-7000-8000-000000000001';
    await expect(prisma.$executeRaw`
      INSERT INTO organization.skills (id, organization_id, name, created_at)
      VALUES (${skillId}::uuid, ${ORGANIZATION_A}::uuid, 'CACES R489', '2026-11-02T08:00:00Z')
    `).resolves.toBe(1);
  });

  async function addSite(organizationId = ORGANIZATION_A): Promise<Site> {
    const id = ids.next();
    const site = Site.create({
      id,
      organizationId,
      code: SiteCode.of(`SITE-${id.slice(-4)}`),
      name: 'Colmar',
      timeZone: TimeZone.of('Europe/Paris'),
      createdAt,
    });
    await sites.add(site);
    return site;
  }

  async function addSkill(organizationId = ORGANIZATION_A): Promise<Skill> {
    const skill = Skill.create({ id: ids.next(), organizationId, name: 'CACES R489', createdAt });
    await skills.add(skill);
    return skill;
  }

  function aPosition(site: Site, skillIds: string[] = []): Position {
    return Position.create({
      id: ids.next(),
      organizationId: site.organizationId,
      siteId: site.id,
      name: 'Cariste',
      skillIds,
      createdAt,
    });
  }

  it('relit une compétence et un poste avec toutes ses compétences et leurs instants', async () => {
    const site = await addSite();
    const firstSkill = await addSkill();
    const secondSkill = await addSkill();
    const position = aPosition(site, [secondSkill.id, firstSkill.id]);
    await positions.add(position);

    const rereadSkill = await skills.findById(ORGANIZATION_A, firstSkill.id);
    const rereadPosition = await positions.findById(ORGANIZATION_A, site.id, position.id);

    expect(rereadSkill).toMatchObject({
      id: firstSkill.id,
      name: 'CACES R489',
      organizationId: ORGANIZATION_A,
    });
    expect(rereadSkill?.createdAt.equals(createdAt)).toBe(true);
    expect(rereadPosition).toMatchObject({
      id: position.id,
      siteId: site.id,
      name: 'Cariste',
      skillIds: [firstSkill.id, secondSkill.id],
    });
    expect(rereadPosition?.createdAt.equals(createdAt)).toBe(true);
  });

  it('crée aussi un poste sans compétence spécifique', async () => {
    const site = await addSite();
    const position = aPosition(site);
    await positions.add(position);

    expect((await positions.findById(ORGANIZATION_A, site.id, position.id))?.skillIds).toEqual([]);
  });

  it('isole les lectures, la validation des références et la suppression par organisation', async () => {
    const skill = await addSkill();
    const site = await addSite();
    const otherSite = await addSite();
    const position = aPosition(site, [skill.id]);
    await positions.add(position);

    await expect(skills.findById(ORGANIZATION_B, skill.id)).resolves.toBeUndefined();
    await expect(skills.allExist(ORGANIZATION_B, [skill.id])).resolves.toBe(false);
    await expect(skills.allExist(ORGANIZATION_A, [skill.id])).resolves.toBe(true);
    await expect(skills.allExist(ORGANIZATION_A, [skill.id, ids.next()])).resolves.toBe(false);
    await expect(skills.allExist(ORGANIZATION_A, [])).resolves.toBe(true);
    await expect(skills.remove(ORGANIZATION_B, skill.id)).resolves.toBe(false);
    await expect(positions.findById(ORGANIZATION_B, site.id, position.id)).resolves.toBeUndefined();
    await expect(
      positions.findById(ORGANIZATION_A, otherSite.id, position.id),
    ).resolves.toBeUndefined();
    expect((await positions.listBySite(ORGANIZATION_B, site.id, { limit: 10 })).items).toEqual([]);
  });

  it('pagine les compétences de son organisation sans doublon ni nom unique imposé', async () => {
    const firstSkill = await addSkill();
    await addSkill(ORGANIZATION_B);
    const secondSkill = await addSkill();
    const thirdSkill = await addSkill();

    const firstPage = await skills.list(ORGANIZATION_A, { limit: 2 });
    const secondPage = await skills.list(ORGANIZATION_A, {
      limit: 2,
      after: firstPage.nextCursor ?? undefined,
    });

    expect(firstPage.items.map((skill) => skill.id)).toEqual([firstSkill.id, secondSkill.id]);
    expect(firstPage.nextCursor).toBe(secondSkill.id);
    expect(secondPage.items.map((skill) => skill.id)).toEqual([thirdSkill.id]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('pagine les postes de son site sans imposer un nom unique', async () => {
    const site = await addSite();
    const otherSite = await addSite();
    const foreignSite = await addSite(ORGANIZATION_B);
    const firstPosition = aPosition(site);
    const secondPosition = aPosition(site);
    const thirdPosition = aPosition(site);
    for (const position of [
      firstPosition,
      aPosition(otherSite),
      secondPosition,
      aPosition(foreignSite),
      thirdPosition,
    ]) {
      await positions.add(position);
    }

    const firstPage = await positions.listBySite(ORGANIZATION_A, site.id, { limit: 2 });
    const secondPage = await positions.listBySite(ORGANIZATION_A, site.id, {
      limit: 2,
      after: firstPage.nextCursor ?? undefined,
    });

    expect(firstPage.items.map((position) => position.id)).toEqual([
      firstPosition.id,
      secondPosition.id,
    ]);
    expect(firstPage.nextCursor).toBe(secondPosition.id);
    expect(secondPage.items.map((position) => position.id)).toEqual([thirdPosition.id]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('la base refuse un poste sur le site d’une autre organisation', async () => {
    const site = await addSite();

    await expect(
      prisma.position.create({
        data: {
          id: ids.next(),
          organizationId: ORGANIZATION_B,
          siteId: site.id,
          name: 'Cariste',
          createdAt: instantToDate(createdAt),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it.each(['compétence', 'poste'])(
    'la base refuse une association avec une %s d’une autre organisation',
    async (foreignReference) => {
      const site = await addSite();
      const foreignSite = await addSite(ORGANIZATION_B);
      const skill = await addSkill(
        foreignReference === 'compétence' ? ORGANIZATION_B : ORGANIZATION_A,
      );
      const position = aPosition(foreignReference === 'poste' ? foreignSite : site);
      await positions.add(position);

      await expect(
        prisma.positionSkill.create({
          data: {
            organizationId: ORGANIZATION_A,
            positionId: position.id,
            skillId: skill.id,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    },
  );

  it('supprime une compétence inutilisée et signale ensuite son absence', async () => {
    const skill = await addSkill();

    await expect(skills.remove(ORGANIZATION_A, skill.id)).resolves.toBe(true);
    await expect(skills.findById(ORGANIZATION_A, skill.id)).resolves.toBeUndefined();
    await expect(skills.remove(ORGANIZATION_A, skill.id)).resolves.toBe(false);
    expect((await skills.list(ORGANIZATION_A, { limit: 10 })).items).toEqual([]);
  });

  it('protège une compétence utilisée et traduit la clé étrangère en conflit métier', async () => {
    const skill = await addSkill();
    const site = await addSite();
    const position = aPosition(site, [skill.id]);
    await positions.add(position);

    await expect(skills.remove(ORGANIZATION_A, skill.id)).rejects.toThrow(SkillInUseError);
    expect((await skills.findById(ORGANIZATION_A, skill.id))?.id).toBe(skill.id);
    expect((await positions.findById(ORGANIZATION_A, site.id, position.id))?.skillIds).toEqual([
      skill.id,
    ]);
  });

  it('annule tout le poste si une de ses compétences est introuvable', async () => {
    const site = await addSite();
    const skill = await addSkill();
    const position = aPosition(site, [skill.id, ids.next()]);

    await expect(positions.add(position)).rejects.toThrow(PositionReferenceNotFoundError);
    await expect(positions.findById(ORGANIZATION_A, site.id, position.id)).resolves.toBeUndefined();
    expect(await prisma.positionSkill.count({ where: { organizationId: ORGANIZATION_A } })).toBe(0);
    expect((await skills.findById(ORGANIZATION_A, skill.id))?.id).toBe(skill.id);
  });

  it('annule la création si la compétence disparaît après la vérification des références', async () => {
    const site = await addSite();
    const skill = await addSkill();
    const position = aPosition(site, [skill.id]);
    expect(await skills.allExist(ORGANIZATION_A, position.skillIds)).toBe(true);
    await skills.remove(ORGANIZATION_A, skill.id);

    await expect(positions.add(position)).rejects.toThrow(PositionReferenceNotFoundError);
    expect((await positions.listBySite(ORGANIZATION_A, site.id, { limit: 10 })).items).toEqual([]);
  });

  it('BDD concurrence : création et suppression simultanées préservent les références', async () => {
    const site = await addSite();
    const skill = await addSkill();
    const position = aPosition(site, [skill.id]);

    const [creation, deletion] = await Promise.allSettled([
      positions.add(position),
      skills.remove(ORGANIZATION_A, skill.id),
    ]);
    const storedPosition = await positions.findById(ORGANIZATION_A, site.id, position.id);
    const storedSkill = await skills.findById(ORGANIZATION_A, skill.id);

    if (creation.status === 'fulfilled') {
      expect(deletion.status).toBe('rejected');
      if (deletion.status === 'rejected') {
        expect(deletion.reason).toBeInstanceOf(SkillInUseError);
      }
      expect(storedSkill?.id).toBe(skill.id);
      expect(storedPosition?.skillIds).toEqual([skill.id]);
      return;
    }
    expect(creation.reason).toBeInstanceOf(PositionReferenceNotFoundError);
    expect(deletion).toEqual({ status: 'fulfilled', value: true });
    expect(storedSkill).toBeUndefined();
    expect(storedPosition).toBeUndefined();
    expect(await prisma.positionSkill.count({ where: { organizationId: ORGANIZATION_A } })).toBe(0);
  });
});
