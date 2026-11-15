import {
  CreatePosition,
  CreateShiftTemplate,
  CreateSite,
  GetPosition,
  GetShiftTemplate,
  GetSite,
} from '@trame/api/organization/application';
import {
  InMemoryPositionRepository,
  InMemoryShiftTemplateRepository,
  InMemorySiteRepository,
  InMemorySkillRepository,
} from '@trame/api/organization/application/testing';
import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { SiteCatalogAdapter } from './site-catalog.adapter';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';

async function setUp() {
  const sites = new InMemorySiteRepository();
  const skills = new InMemorySkillRepository();
  const positions = new InMemoryPositionRepository();
  const shiftTemplates = new InMemoryShiftTemplateRepository();
  const clock = new FixedClock(Temporal.Instant.from('2026-11-15T08:00:00Z'));
  const ids = new SequentialIdGenerator();
  const createSite = new CreateSite(sites, clock, ids);
  const warehouse = await createSite.execute({
    organizationId: ORGANIZATION_A,
    code: 'DEMO',
    name: 'Entrepôt de démonstration',
    timeZone: 'Europe/Paris',
  });
  const secondSite = await createSite.execute({
    organizationId: ORGANIZATION_A,
    code: 'QUAI',
    name: 'Quai de transit',
    timeZone: 'Europe/Paris',
  });
  const morning = await new CreateShiftTemplate(sites, shiftTemplates, clock, ids).execute({
    organizationId: ORGANIZATION_A,
    siteId: warehouse.id,
    label: 'Matin',
    start: Temporal.PlainTime.from('06:00'),
    end: Temporal.PlainTime.from('13:20'),
    break: { start: Temporal.PlainTime.from('09:30'), durationMinutes: 20 },
  });
  const orderPicker = await new CreatePosition(sites, skills, positions, clock, ids).execute({
    organizationId: ORGANIZATION_A,
    siteId: warehouse.id,
    name: 'Préparateur de commandes',
    skillIds: [],
  });
  const adapter = new SiteCatalogAdapter(
    new GetSite(sites),
    new GetShiftTemplate(sites, shiftTemplates),
    new GetPosition(sites, positions),
  );
  return { adapter, warehouse, secondSite, morning, orderPicker };
}

describe('SiteCatalogAdapter', () => {
  it('reconnaît un site de l’organisation, et lui seul', async () => {
    const { adapter, warehouse } = await setUp();

    expect(await adapter.hasSite(ORGANIZATION_A, warehouse.id)).toBe(true);
    expect(await adapter.hasSite(ORGANIZATION_A, UNKNOWN_ID)).toBe(false);
    expect(await adapter.hasSite(ORGANIZATION_B, warehouse.id)).toBe(false);
  });

  it('exige que chaque créneau type appartienne au site', async () => {
    const { adapter, warehouse, secondSite, morning } = await setUp();

    expect(await adapter.hasAllShiftTemplates(ORGANIZATION_A, warehouse.id, [morning.id])).toBe(
      true,
    );
    expect(
      await adapter.hasAllShiftTemplates(ORGANIZATION_A, warehouse.id, [morning.id, UNKNOWN_ID]),
    ).toBe(false);
    expect(await adapter.hasAllShiftTemplates(ORGANIZATION_A, secondSite.id, [morning.id])).toBe(
      false,
    );
    expect(await adapter.hasAllShiftTemplates(ORGANIZATION_B, warehouse.id, [morning.id])).toBe(
      false,
    );
  });

  it('exige que chaque poste appartienne au site', async () => {
    const { adapter, warehouse, secondSite, orderPicker } = await setUp();

    expect(await adapter.hasAllPositions(ORGANIZATION_A, warehouse.id, [orderPicker.id])).toBe(
      true,
    );
    expect(await adapter.hasAllPositions(ORGANIZATION_A, secondSite.id, [orderPicker.id])).toBe(
      false,
    );
    expect(await adapter.hasAllPositions(ORGANIZATION_B, warehouse.id, [orderPicker.id])).toBe(
      false,
    );
  });

  it('accepte des listes vides : une semaine peut n’avoir aucun besoin', async () => {
    const { adapter, warehouse } = await setUp();

    expect(await adapter.hasAllShiftTemplates(ORGANIZATION_A, warehouse.id, [])).toBe(true);
    expect(await adapter.hasAllPositions(ORGANIZATION_A, warehouse.id, [])).toBe(true);
  });
});
