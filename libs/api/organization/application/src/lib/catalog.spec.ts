import { InvalidSkillNameError, SkillInUseError } from '@trame/api/organization/domain';
import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { InMemoryPositionRepository } from '../testing/in-memory-position.repository';
import { InMemorySkillRepository } from '../testing/in-memory-skill.repository';
import { InMemorySiteRepository } from '../testing/in-memory-site.repository';
import { CreateSite } from './sites/create-site';
import { CreatePosition } from './positions/create-position';
import { GetPosition } from './positions/get-position';
import { ListPositions } from './positions/list-positions';
import { CreateSkill } from './skills/create-skill';
import { DeleteSkill } from './skills/delete-skill';
import { GetSkill } from './skills/get-skill';
import { ListSkills } from './skills/list-skills';
import { PositionNotFoundError, SiteNotFoundError, SkillNotFoundError } from './not-found.errors';

const now = Temporal.Instant.from('2026-11-02T08:00:00Z');

async function setUp() {
  const clock = new FixedClock(now);
  const ids = new SequentialIdGenerator();
  const sites = new InMemorySiteRepository();
  const positions = new InMemoryPositionRepository();
  const skills = new InMemorySkillRepository(positions);
  const createSite = new CreateSite(sites, clock, ids);
  const site = await createSite.execute({
    organizationId: 'org-a',
    code: 'COL',
    name: 'Colmar',
    timeZone: 'Europe/Paris',
  });
  return {
    site,
    positions,
    createSkill: new CreateSkill(skills, clock, ids),
    getSkill: new GetSkill(skills),
    deleteSkill: new DeleteSkill(skills),
    listSkills: new ListSkills(skills),
    createPosition: new CreatePosition(sites, skills, positions, clock, ids),
    getPosition: new GetPosition(sites, positions),
    listPositions: new ListPositions(sites, positions),
  };
}

describe('cas d’usage du catalogue et des postes', () => {
  it('attribue les identifiants et les instants par les ports dédiés', async () => {
    const services = await setUp();
    const skill = await services.createSkill.execute({ organizationId: 'org-a', name: 'CACES' });
    expect(skill.id).toBe('00000000-0000-7000-8000-000000000002');
    expect(skill.createdAt.equals(now)).toBe(true);
    const position = await services.createPosition.execute({
      organizationId: 'org-a',
      siteId: services.site.id,
      name: 'Cariste',
      skillIds: [skill.id],
    });
    expect(position.id).toBe('00000000-0000-7000-8000-000000000003');
    expect(position.createdAt.equals(now)).toBe(true);
    expect(await services.getSkill.execute({ organizationId: 'org-a', skillId: skill.id })).toEqual(
      skill,
    );
    expect(
      await services.getPosition.execute({
        organizationId: 'org-a',
        siteId: services.site.id,
        positionId: position.id,
      }),
    ).toEqual(position);
  });

  it('refuse les références de compétences absentes ou étrangères sans enregistrer de poste', async () => {
    const services = await setUp();
    const foreignSkill = await services.createSkill.execute({
      organizationId: 'org-b',
      name: 'CACES',
    });
    for (const skillId of [foreignSkill.id, 'missing']) {
      await expect(
        services.createPosition.execute({
          organizationId: 'org-a',
          siteId: services.site.id,
          name: 'Cariste',
          skillIds: [skillId],
        }),
      ).rejects.toThrow(SkillNotFoundError);
    }
    expect(
      (
        await services.listPositions.execute({
          organizationId: 'org-a',
          siteId: services.site.id,
          page: { limit: 10 },
        })
      ).items,
    ).toEqual([]);
  });

  it('refuse un site absent ou appartenant à une autre organisation', async () => {
    const services = await setUp();
    for (const siteId of [services.site.id, 'missing']) {
      await expect(
        services.createPosition.execute({
          organizationId: 'org-b',
          siteId,
          name: 'Cariste',
          skillIds: [],
        }),
      ).rejects.toThrow(SiteNotFoundError);
    }
  });

  it('refuse un poste absent sur un site accessible', async () => {
    const services = await setUp();
    await expect(
      services.getPosition.execute({
        organizationId: 'org-a',
        siteId: services.site.id,
        positionId: 'missing',
      }),
    ).rejects.toThrow(PositionNotFoundError);
  });

  it('supprime une compétence inutilisée et ne révèle pas les compétences étrangères', async () => {
    const services = await setUp();
    const skill = await services.createSkill.execute({ organizationId: 'org-a', name: 'CACES' });
    await expect(
      services.deleteSkill.execute({ organizationId: 'org-b', skillId: skill.id }),
    ).rejects.toThrow(SkillNotFoundError);
    await expect(
      services.getSkill.execute({ organizationId: 'org-b', skillId: skill.id }),
    ).rejects.toThrow(SkillNotFoundError);
    await services.deleteSkill.execute({ organizationId: 'org-a', skillId: skill.id });
    await expect(
      services.getSkill.execute({ organizationId: 'org-a', skillId: skill.id }),
    ).rejects.toThrow(SkillNotFoundError);
    await expect(
      services.deleteSkill.execute({ organizationId: 'org-a', skillId: skill.id }),
    ).rejects.toThrow(SkillNotFoundError);
  });

  it('conserve une compétence utilisée et propage le conflit métier', async () => {
    const services = await setUp();
    const skill = await services.createSkill.execute({ organizationId: 'org-a', name: 'CACES' });
    await services.createPosition.execute({
      organizationId: 'org-a',
      siteId: services.site.id,
      name: 'Cariste',
      skillIds: [skill.id],
    });
    await expect(
      services.deleteSkill.execute({ organizationId: 'org-a', skillId: skill.id }),
    ).rejects.toThrow(SkillInUseError);
    expect(
      (await services.getSkill.execute({ organizationId: 'org-a', skillId: skill.id })).id,
    ).toBe(skill.id);
  });

  it('ne persiste pas une compétence invalide', async () => {
    const services = await setUp();
    await expect(
      services.createSkill.execute({ organizationId: 'org-a', name: ' ' }),
    ).rejects.toThrow(InvalidSkillNameError);
    expect(
      (await services.listSkills.execute({ organizationId: 'org-a', page: { limit: 10 } })).items,
    ).toEqual([]);
  });
});
