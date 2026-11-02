import {
  InvalidSiteCodeError,
  SiteCodeAlreadyUsedError,
  UnknownTimeZoneError,
} from '@trame/api/organization/domain';
import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { InMemorySiteRepository } from '../../testing/in-memory-site.repository';
import { SiteNotFoundError } from '../not-found.errors';
import { CreateSite } from './create-site';
import { GetSite } from './get-site';
import { ListSites } from './list-sites';

const now = Temporal.Instant.from('2026-11-02T08:00:00Z');
const colmar = { organizationId: 'org-a', code: 'COL', name: 'Colmar', timeZone: 'Europe/Paris' };

function setUp() {
  const sites = new InMemorySiteRepository();
  return {
    createSite: new CreateSite(sites, new FixedClock(now), new SequentialIdGenerator()),
    getSite: new GetSite(sites),
    listSites: new ListSites(sites),
  };
}

describe('CreateSite', () => {
  it("crée un site daté par l'horloge, avec un identifiant généré", async () => {
    const { createSite } = setUp();

    const site = await createSite.execute(colmar);

    expect(site.id).toBe('00000000-0000-7000-8000-000000000001');
    expect(site.createdAt.equals(now)).toBe(true);
    expect(site.timeZone.id).toBe('Europe/Paris');
  });

  it("refuse un code déjà utilisé dans l'organisation", async () => {
    const { createSite } = setUp();
    await createSite.execute(colmar);

    await expect(createSite.execute({ ...colmar, name: 'Colmar bis' })).rejects.toThrow(
      SiteCodeAlreadyUsedError,
    );
  });

  it('accepte le même code dans une autre organisation', async () => {
    const { createSite } = setUp();
    await createSite.execute(colmar);

    await expect(createSite.execute({ ...colmar, organizationId: 'org-b' })).resolves.toBeDefined();
  });

  it('refuse un fuseau inconnu', async () => {
    const { createSite } = setUp();

    await expect(createSite.execute({ ...colmar, timeZone: 'Europe/Colmar' })).rejects.toThrow(
      UnknownTimeZoneError,
    );
  });

  it('refuse un code mal formé', async () => {
    const { createSite } = setUp();

    await expect(createSite.execute({ ...colmar, code: 'col' })).rejects.toThrow(
      InvalidSiteCodeError,
    );
  });
});

describe('GetSite', () => {
  it('lit un site de son organisation', async () => {
    const { createSite, getSite } = setUp();
    const created = await createSite.execute(colmar);

    const site = await getSite.execute({ organizationId: 'org-a', siteId: created.id });

    expect(site.code.value).toBe('COL');
  });

  it("ne trouve pas le site d'une autre organisation", async () => {
    const { createSite, getSite } = setUp();
    const created = await createSite.execute(colmar);

    await expect(getSite.execute({ organizationId: 'org-b', siteId: created.id })).rejects.toThrow(
      SiteNotFoundError,
    );
  });
});

describe('ListSites', () => {
  it("ne liste que les sites de l'organisation, page par page", async () => {
    const { createSite, listSites } = setUp();
    await createSite.execute(colmar);
    await createSite.execute({ ...colmar, code: 'LYS' });
    await createSite.execute({ ...colmar, code: 'MUL' });
    await createSite.execute({ ...colmar, organizationId: 'org-b', code: 'AUT' });

    const firstPage = await listSites.execute({ organizationId: 'org-a', page: { limit: 2 } });
    const after = firstPage.nextCursor ?? '';
    const secondPage = await listSites.execute({
      organizationId: 'org-a',
      page: { limit: 2, after },
    });

    expect(firstPage.items.map((site) => site.code.value)).toEqual(['COL', 'LYS']);
    expect(secondPage.items.map((site) => site.code.value)).toEqual(['MUL']);
    expect(secondPage.nextCursor).toBeNull();
  });
});
