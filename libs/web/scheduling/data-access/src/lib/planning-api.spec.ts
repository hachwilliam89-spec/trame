import { PlanningApi, PlanningHttpError } from './planning-api';

const SITE = '0190f0a0-0000-7000-8000-0000000000d1';
const CURSOR = '0190f0a0-0000-7000-8000-0000000000e1';
const CREATED_AT = '2026-11-17T08:00:00.000Z';

function employee(id: string) {
  return {
    id,
    siteId: SITE,
    firstName: 'Camille',
    lastName: 'Laurent',
    qualifications: [],
    createdAt: CREATED_AT,
  };
}

/** `fetch` simulé : répond selon le chemin et garde chaque requête. */
function fakeFetch(answer: (url: URL, options: RequestInit) => Response) {
  const requests: { url: URL; options: RequestInit }[] = [];
  const request: typeof fetch = (input, options) => {
    const url = new URL(String(input), 'http://localhost');
    requests.push({ url, options: options ?? {} });
    return Promise.resolve(answer(url, options ?? {}));
  };
  return { requests, request };
}

describe('Client HTTP du planning', () => {
  const signal = new AbortController().signal;

  it('lit les générations de la semaine avec le jeton, sans cookie ni redirection', async () => {
    const { requests, request } = fakeFetch(() =>
      Response.json({ latestAttempt: null, latestSchedule: null }),
    );
    const api = new PlanningApi(async () => 'opaque-access-token', '/api/v1', request);

    await expect(api.week(SITE, '2026-11-23', signal)).resolves.toEqual({
      latestAttempt: null,
      latestSchedule: null,
    });

    const sent = requests[0];
    expect(sent?.url.pathname).toBe('/api/v1/schedule-generations');
    expect(sent?.url.searchParams.get('siteId')).toBe(SITE);
    expect(sent?.url.searchParams.get('weekStartsOn')).toBe('2026-11-23');
    expect(new Headers(sent?.options.headers).get('authorization')).toBe(
      'Bearer opaque-access-token',
    );
    expect(sent?.options.credentials).toBe('omit');
    expect(sent?.options.redirect).toBe('error');
  });

  it('parcourt toutes les pages des salariés du site', async () => {
    const first = '0190f0a0-0000-7000-8000-000000000041';
    const second = '0190f0a0-0000-7000-8000-000000000042';
    const { requests, request } = fakeFetch((url) => {
      if (url.searchParams.get('cursor') === CURSOR) {
        return Response.json({ items: [employee(second)], nextCursor: null });
      }
      return Response.json({ items: [employee(first)], nextCursor: CURSOR });
    });
    const api = new PlanningApi(async () => 'token', '/api/v1', request);

    const employees = await api.employees(SITE, signal);

    expect(employees.map((item) => item.id)).toEqual([first, second]);
    expect(requests.map((sent) => sent.url.searchParams.get('limit'))).toEqual(['100', '100']);
    expect(requests[1]?.url.searchParams.get('siteId')).toBe(SITE);
  });

  it('lance une génération avec sa clé d’idempotence, pour le site et la semaine demandés', async () => {
    const { requests, request } = fakeFetch(() => new Response('{}', { status: 503 }));
    const api = new PlanningApi(async () => 'token', '/api/v1', request);

    await expect(
      api.start({ siteId: SITE, weekStartsOn: '2026-11-23' }, 'clé-A', signal),
    ).rejects.toEqual(new PlanningHttpError(503));

    const sent = requests[0];
    expect(sent?.options.method).toBe('POST');
    expect(new Headers(sent?.options.headers).get('idempotency-key')).toBe('clé-A');
    expect(JSON.parse(String(sent?.options.body))).toEqual({
      siteId: SITE,
      weekStartsOn: '2026-11-23',
    });
  });

  it('termine le suivi sans lire de flux quand la génération est déjà finie (204)', async () => {
    const { requests, request } = fakeFetch(() => new Response(null, { status: 204 }));
    const api = new PlanningApi(async () => 'token', '/api/v1', request);
    const receive = vi.fn();

    await api.follow(CURSOR, receive, signal);

    expect(requests[0]?.url.pathname).toBe(`/api/v1/schedule-generations/${CURSOR}/events`);
    expect(new Headers(requests[0]?.options.headers).get('accept')).toBe('text/event-stream');
    expect(receive).not.toHaveBeenCalled();
  });

  it('signale le statut HTTP d’un refus', async () => {
    const { request } = fakeFetch(() => new Response('{}', { status: 404 }));
    const api = new PlanningApi(async () => 'token', '/api/v1', request);

    await expect(api.site(SITE, signal)).rejects.toEqual(new PlanningHttpError(404));
  });
});
