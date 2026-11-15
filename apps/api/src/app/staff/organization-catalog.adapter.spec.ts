import { CreateSite, CreateSkill, GetSite, GetSkill } from '@trame/api/organization/application';
import {
  InMemorySiteRepository,
  InMemorySkillRepository,
} from '@trame/api/organization/application/testing';
import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { OrganizationCatalogAdapter } from './organization-catalog.adapter';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';

function setUp() {
  const sites = new InMemorySiteRepository();
  const skills = new InMemorySkillRepository();
  const clock = new FixedClock(Temporal.Instant.from('2026-11-15T08:00:00Z'));
  const ids = new SequentialIdGenerator();
  return {
    createSite: new CreateSite(sites, clock, ids),
    createSkill: new CreateSkill(skills, clock, ids),
    adapter: new OrganizationCatalogAdapter(new GetSite(sites), new GetSkill(skills)),
  };
}

describe('OrganizationCatalogAdapter', () => {
  it('reconnaît un site de l’organisation, et lui seul', async () => {
    const { createSite, adapter } = setUp();
    const site = await createSite.execute({
      organizationId: ORGANIZATION_A,
      code: 'DEMO',
      name: 'Entrepôt de démonstration',
      timeZone: 'Europe/Paris',
    });

    expect(await adapter.hasSite(ORGANIZATION_A, site.id)).toBe(true);
    expect(await adapter.hasSite(ORGANIZATION_A, UNKNOWN_ID)).toBe(false);
    expect(await adapter.hasSite(ORGANIZATION_B, site.id)).toBe(false);
  });

  it('exige que toutes les compétences existent dans l’organisation', async () => {
    const { createSkill, adapter } = setUp();
    const category3 = await createSkill.execute({
      organizationId: ORGANIZATION_A,
      name: 'CACES R489 catégorie 3',
    });
    const category5 = await createSkill.execute({
      organizationId: ORGANIZATION_A,
      name: 'CACES R489 catégorie 5',
    });

    expect(await adapter.hasAllSkills(ORGANIZATION_A, [category3.id, category5.id])).toBe(true);
    expect(await adapter.hasAllSkills(ORGANIZATION_A, [category3.id, UNKNOWN_ID])).toBe(false);
    expect(await adapter.hasAllSkills(ORGANIZATION_B, [category3.id])).toBe(false);
  });

  it('accepte une liste vide : un employé peut n’avoir aucune habilitation', async () => {
    const { adapter } = setUp();

    expect(await adapter.hasAllSkills(ORGANIZATION_A, [])).toBe(true);
  });
});
