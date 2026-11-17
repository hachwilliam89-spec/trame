import {
  PLANNING_RETURN_KEY,
  planningReturnAddress,
  readPlanningAddress,
  rememberPlanningReturn,
} from './planning-address';

const SITE = '01a1e8e7-7cc0-72a4-84fa-199455f5f690';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('adresse du planning', () => {
  it('garde un site et un lundi valides', () => {
    expect(readPlanningAddress(SITE, '2026-11-23')).toEqual({
      siteId: SITE,
      weekStartsOn: '2026-11-23',
    });
    expect(readPlanningAddress(SITE.toUpperCase(), '2026-11-23')?.siteId).toBe(SITE);
  });

  it.each([
    ['sans site', null, '2026-11-23'],
    ['sans semaine', SITE, null],
    ['un site qui n’est pas un UUID', 'demo', '2026-11-23'],
    ['une date qui n’est pas un lundi', SITE, '2026-11-24'],
    ['une date impossible', SITE, '2026-02-30'],
    ['une date mal écrite', SITE, '23/11/2026'],
  ])('refuse une adresse %s', (_case, site, week) => {
    expect(readPlanningAddress(site, week)).toBeUndefined();
  });
});

describe('retour au planning après la connexion', () => {
  it('retient le site et la semaine, puis reconstruit l’adresse interne au retour', () => {
    const storage = memoryStorage();

    rememberPlanningReturn(storage, '/planning', `?site=${SITE}&semaine=2026-11-23&autre=x`);

    expect(JSON.parse(storage.getItem(PLANNING_RETURN_KEY) ?? '')).toEqual({
      siteId: SITE,
      weekStartsOn: '2026-11-23',
    });
    expect(planningReturnAddress(storage)).toBe(`/planning?site=${SITE}&semaine=2026-11-23`);
    expect(storage.getItem(PLANNING_RETURN_KEY)).toBeNull();
  });

  it('revient à l’accueil depuis une autre page ou une adresse invalide', () => {
    const storage = memoryStorage();
    storage.setItem(
      PLANNING_RETURN_KEY,
      JSON.stringify({ siteId: SITE, weekStartsOn: '2026-11-23' }),
    );

    rememberPlanningReturn(storage, '/', '');
    expect(planningReturnAddress(storage)).toBe('/');

    rememberPlanningReturn(
      storage,
      '/planning',
      '?site=https://ailleurs.example&semaine=2026-11-23',
    );
    expect(planningReturnAddress(storage)).toBe('/');
  });

  it('ne suit jamais une valeur stockée qui n’est pas une adresse de planning valide', () => {
    const storage = memoryStorage();
    storage.setItem(
      PLANNING_RETURN_KEY,
      JSON.stringify({ siteId: '//ailleurs.example', weekStartsOn: '2026-11-23' }),
    );
    expect(planningReturnAddress(storage)).toBe('/');

    storage.setItem(PLANNING_RETURN_KEY, '{');
    expect(planningReturnAddress(storage)).toBe('/');
  });
});
