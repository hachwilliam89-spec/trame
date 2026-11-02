import {
  BreakOutsideShiftError,
  ShiftTemplateLabelAlreadyUsedError,
} from '@trame/api/organization/domain';
import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { InMemoryShiftTemplateRepository } from '../../testing/in-memory-shift-template.repository';
import { InMemorySiteRepository } from '../../testing/in-memory-site.repository';
import { ShiftTemplateNotFoundError, SiteNotFoundError } from '../not-found.errors';
import { CreateSite } from '../sites/create-site';
import { CreateShiftTemplate, type CreateShiftTemplateCommand } from './create-shift-template';
import { GetShiftTemplateDurations } from './get-shift-template-durations';
import { ListShiftTemplates } from './list-shift-templates';

const time = (text: string): Temporal.PlainTime => Temporal.PlainTime.from(text);

async function setUp() {
  const sites = new InMemorySiteRepository();
  const shiftTemplates = new InMemoryShiftTemplateRepository();
  const clock = new FixedClock(Temporal.Instant.from('2026-11-02T08:00:00Z'));
  const ids = new SequentialIdGenerator();

  const site = await new CreateSite(sites, clock, ids).execute({
    organizationId: 'org-a',
    code: 'COL',
    name: 'Colmar',
    timeZone: 'Europe/Paris',
  });
  const night: CreateShiftTemplateCommand = {
    organizationId: 'org-a',
    siteId: site.id,
    label: 'Nuit',
    start: time('22:00'),
    end: time('06:00'),
    break: { start: time('02:00'), durationMinutes: 30 },
  };

  return {
    site,
    night,
    createShiftTemplate: new CreateShiftTemplate(sites, shiftTemplates, clock, ids),
    listShiftTemplates: new ListShiftTemplates(sites, shiftTemplates),
    getDurations: new GetShiftTemplateDurations(sites, shiftTemplates),
  };
}

describe('CreateShiftTemplate', () => {
  it('crée un créneau de nuit avec sa pause', async () => {
    const { createShiftTemplate, night, site } = await setUp();

    const shiftTemplate = await createShiftTemplate.execute(night);

    expect(shiftTemplate.siteId).toBe(site.id);
    expect(shiftTemplate.crossesMidnight).toBe(true);
    expect(shiftTemplate.break?.durationMinutes).toBe(30);
  });

  it('refuse un libellé déjà utilisé sur le site', async () => {
    const { createShiftTemplate, night } = await setUp();
    await createShiftTemplate.execute(night);

    await expect(createShiftTemplate.execute(night)).rejects.toThrow(
      ShiftTemplateLabelAlreadyUsedError,
    );
  });

  it('refuse une pause hors du créneau', async () => {
    const { createShiftTemplate, night } = await setUp();

    await expect(
      createShiftTemplate.execute({
        ...night,
        break: { start: time('07:00'), durationMinutes: 30 },
      }),
    ).rejects.toThrow(BreakOutsideShiftError);
  });

  it("refuse un site d'une autre organisation", async () => {
    const { createShiftTemplate, night } = await setUp();

    await expect(
      createShiftTemplate.execute({ ...night, organizationId: 'org-b' }),
    ).rejects.toThrow(SiteNotFoundError);
  });
});

describe('ListShiftTemplates', () => {
  it('liste les créneaux du site', async () => {
    const { createShiftTemplate, listShiftTemplates, night, site } = await setUp();
    await createShiftTemplate.execute(night);
    await createShiftTemplate.execute({
      ...night,
      label: 'Matin',
      start: time('06:00'),
      end: time('14:00'),
      break: null,
    });

    const page = await listShiftTemplates.execute({
      organizationId: 'org-a',
      siteId: site.id,
      page: { limit: 50 },
    });

    expect(page.items.map((shiftTemplate) => shiftTemplate.label)).toEqual(['Nuit', 'Matin']);
  });

  it("répond « introuvable » pour le site d'une autre organisation, plutôt qu'une liste vide", async () => {
    const { listShiftTemplates, site } = await setUp();

    await expect(
      listShiftTemplates.execute({ organizationId: 'org-b', siteId: site.id, page: { limit: 50 } }),
    ).rejects.toThrow(SiteNotFoundError);
  });
});

describe('GetShiftTemplateDurations', () => {
  // Scénario : Créneau de nuit au changement d'heure (US-030), de bout en bout côté application.
  it("calcule 9 h d'amplitude et 8 h 30 effectives la nuit du passage à l'heure d'hiver", async () => {
    const { createShiftTemplate, getDurations, night, site } = await setUp();
    const shiftTemplate = await createShiftTemplate.execute(night);

    const durations = await getDurations.execute({
      organizationId: 'org-a',
      siteId: site.id,
      shiftTemplateId: shiftTemplate.id,
      date: Temporal.PlainDate.from('2026-10-24'),
    });

    expect(durations.amplitudeMinutes).toBe(540);
    expect(durations.effectiveMinutes).toBe(510);
  });

  it("ne trouve pas un créneau d'un autre site", async () => {
    const { createShiftTemplate, getDurations, night } = await setUp();
    const shiftTemplate = await createShiftTemplate.execute(night);

    await expect(
      getDurations.execute({
        organizationId: 'org-a',
        siteId: '00000000-0000-7000-8000-0000000000ff',
        shiftTemplateId: shiftTemplate.id,
        date: Temporal.PlainDate.from('2026-10-24'),
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });

  it('ne trouve pas un créneau inexistant', async () => {
    const { getDurations, site } = await setUp();

    await expect(
      getDurations.execute({
        organizationId: 'org-a',
        siteId: site.id,
        shiftTemplateId: '00000000-0000-7000-8000-0000000000ff',
        date: Temporal.PlainDate.from('2026-10-24'),
      }),
    ).rejects.toThrow(ShiftTemplateNotFoundError);
  });
});
