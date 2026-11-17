import type {
  ScheduleGenerationProgressV1,
  ScheduleGenerationV1,
} from '@trame/shared/contracts/scheduling';
import { AuthenticationRequired, type WebIdentity } from '@trame/web/auth/data-access';
import { PlanningHttpError, type PlanningGateway } from './planning-api';
import { PlanningState } from './planning-state';

const SITE = '0190f0a0-0000-7000-8000-0000000000d1';
const MONDAY = '2026-11-23';
const manager: WebIdentity = { subject: 'manager-A', organizationId: 'org-A', roles: ['manager'] };

type Result = 'OPTIMAL' | 'INFEASIBLE';

/** Génération réduite à ce que la façade lit : la façade ne revalide pas l'API. */
function generation(
  id: string,
  status: ScheduleGenerationV1['status'],
  result?: Result,
): ScheduleGenerationV1 {
  const schedule = { assignments: [], shortfalls: [] };
  const outcome =
    result === undefined
      ? undefined
      : {
          result:
            result === 'OPTIMAL'
              ? { status: result, schedule }
              : { status: result, schedule: null },
          checkedRules: ['UN_SEUL_SHIFT'],
          solveSeconds: 0.2,
        };
  return { id, siteId: SITE, weekStartsOn: MONDAY, status, outcome } as ScheduleGenerationV1;
}

function progress(
  generationId: string,
  status: 'RUNNING' | 'SUCCEEDED',
): ScheduleGenerationProgressV1 {
  return {
    id: `${generationId}-${status}`,
    generationId,
    sequence: status === 'RUNNING' ? 1 : 2,
    occurredAt: '2026-11-17T10:00:00Z',
    status,
  };
}

/** API simulée : chaque méthode est un `vi.fn` que le test règle. */
function fakeGateway() {
  return {
    site: vi.fn(async () => ({ id: SITE, name: 'Entrepôt de démonstration' })),
    positions: vi.fn(async () => []),
    shiftTemplates: vi.fn(async () => []),
    employees: vi.fn(async () => []),
    week: vi.fn(async () => ({ latestAttempt: null, latestSchedule: null })),
    generation: vi.fn(),
    start: vi.fn(),
    follow: vi.fn(async () => undefined),
  };
}

describe('État du planning d’une semaine', () => {
  let gateway: ReturnType<typeof fakeGateway>;
  let keys: string[];
  let state: PlanningState;

  beforeEach(async () => {
    gateway = fakeGateway();
    keys = ['clé-1', 'clé-2', 'clé-3'];
    state = new PlanningState(gateway as unknown as PlanningGateway, () => keys.shift() ?? 'clé-?');
    await state.identify(manager);
  });

  it('ouvre la semaine : catalogue du site, dernier essai et dernier planning exploitable', async () => {
    const shown = generation('A', 'SUCCEEDED', 'OPTIMAL');
    const failed = generation('B', 'SUCCEEDED', 'INFEASIBLE');
    gateway.week.mockResolvedValue({ latestAttempt: failed, latestSchedule: shown });

    await state.open(SITE, MONDAY);

    expect(state.phase()).toBe('ready');
    expect(state.catalog()?.site.name).toBe('Entrepôt de démonstration');
    expect(state.latestAttempt()).toBe(failed);
    expect(state.latestSchedule()).toBe(shown);
    expect(gateway.week).toHaveBeenCalledWith(SITE, MONDAY, expect.any(AbortSignal));
    expect(gateway.follow).not.toHaveBeenCalled();
  });

  it('reprend le suivi d’un calcul en cours, puis relit la génération à la fin du flux (204 compris)', async () => {
    gateway.week.mockResolvedValue({
      latestAttempt: generation('A', 'RUNNING'),
      latestSchedule: null,
    });
    gateway.generation.mockResolvedValue(generation('A', 'SUCCEEDED', 'OPTIMAL'));

    await state.open(SITE, MONDAY);

    expect(gateway.follow).toHaveBeenCalledWith('A', expect.any(Function), expect.any(AbortSignal));
    expect(gateway.generation).toHaveBeenCalledWith('A', expect.any(AbortSignal));
    expect(state.latestAttempt()?.status).toBe('SUCCEEDED');
    expect(state.latestSchedule()?.id).toBe('A');
    expect(state.request()).toBe('idle');
  });

  it('affiche la progression reçue pendant le calcul', async () => {
    gateway.start.mockResolvedValue(generation('A', 'QUEUED'));
    const seen: string[] = [];
    gateway.follow.mockImplementation(async (_id, receive) => {
      receive(progress('A', 'RUNNING'));
      seen.push(state.latestAttempt()?.status ?? '');
    });
    gateway.generation.mockResolvedValue(generation('A', 'SUCCEEDED', 'OPTIMAL'));
    await state.open(SITE, MONDAY);

    await state.generate();

    expect(seen).toEqual(['RUNNING']);
    expect(gateway.start).toHaveBeenCalledWith(
      { siteId: SITE, weekStartsOn: MONDAY },
      'clé-1',
      expect.any(AbortSignal),
    );
  });

  it('garde le planning précédent quand un nouvel essai ne trouve pas de planning', async () => {
    const previous = generation('A', 'SUCCEEDED', 'OPTIMAL');
    gateway.week.mockResolvedValue({ latestAttempt: previous, latestSchedule: previous });
    gateway.start.mockResolvedValue(generation('B', 'QUEUED'));
    gateway.generation.mockResolvedValue(generation('B', 'SUCCEEDED', 'INFEASIBLE'));
    await state.open(SITE, MONDAY);

    await state.generate();

    expect(state.latestAttempt()?.id).toBe('B');
    expect(state.latestAttempt()?.outcome?.result.status).toBe('INFEASIBLE');
    expect(state.latestSchedule()).toBe(previous);
  });

  it('remplace le planning affiché par celui d’un nouvel essai réussi', async () => {
    const previous = generation('A', 'SUCCEEDED', 'OPTIMAL');
    gateway.week.mockResolvedValue({ latestAttempt: previous, latestSchedule: previous });
    gateway.start.mockResolvedValue(generation('B', 'QUEUED'));
    gateway.generation.mockResolvedValue(generation('B', 'SUCCEEDED', 'OPTIMAL'));
    await state.open(SITE, MONDAY);

    await state.generate();

    expect(state.latestSchedule()?.id).toBe('B');
  });

  it('retente avec la même clé quand la réponse au lancement se perd, puis en prend une nouvelle', async () => {
    gateway.start.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    gateway.start.mockResolvedValue(generation('A', 'QUEUED'));
    gateway.generation.mockResolvedValue(generation('A', 'SUCCEEDED', 'OPTIMAL'));
    await state.open(SITE, MONDAY);

    await state.generate();
    expect(state.request()).toBe('lost');
    await state.generate();
    await state.generate();

    const usedKeys = gateway.start.mock.calls.map((call) => call[1]);
    expect(usedKeys).toEqual(['clé-1', 'clé-1', 'clé-2']);
  });

  it('signale un calcul dont le suivi s’est coupé avant son issue', async () => {
    gateway.start.mockResolvedValue(generation('A', 'QUEUED'));
    gateway.generation.mockResolvedValue(generation('A', 'RUNNING'));
    await state.open(SITE, MONDAY);

    await state.generate();

    expect(state.request()).toBe('interrupted');
    expect(state.latestAttempt()?.status).toBe('RUNNING');
  });

  it('reprend un suivi coupé sans lancer de nouveau calcul', async () => {
    gateway.start.mockResolvedValue(generation('A', 'QUEUED'));
    gateway.generation.mockResolvedValueOnce(generation('A', 'RUNNING'));
    gateway.generation.mockResolvedValue(generation('A', 'SUCCEEDED', 'OPTIMAL'));
    await state.open(SITE, MONDAY);
    await state.generate();

    await state.generate();
    expect(gateway.start).toHaveBeenCalledOnce();
    await state.resume();

    expect(gateway.follow).toHaveBeenCalledTimes(2);
    expect(state.request()).toBe('idle');
    expect(state.latestSchedule()?.id).toBe('A');
  });

  it('garde l’écran quand la relecture après le flux échoue sur une coupure réseau', async () => {
    const previous = generation('A', 'SUCCEEDED', 'OPTIMAL');
    gateway.week.mockResolvedValue({ latestAttempt: previous, latestSchedule: previous });
    gateway.start.mockResolvedValue(generation('B', 'QUEUED'));
    gateway.generation.mockRejectedValue(new TypeError('Failed to fetch'));
    await state.open(SITE, MONDAY);

    await state.generate();

    expect(state.phase()).toBe('ready');
    expect(state.request()).toBe('interrupted');
    expect(state.latestSchedule()).toBe(previous);
  });

  it('garde l’écran quand la relecture d’un calcul repris à l’ouverture échoue', async () => {
    const previous = generation('A', 'SUCCEEDED', 'OPTIMAL');
    gateway.week.mockResolvedValue({
      latestAttempt: generation('B', 'RUNNING'),
      latestSchedule: previous,
    });
    gateway.generation.mockRejectedValue(new TypeError('Failed to fetch'));

    await state.open(SITE, MONDAY);

    expect(state.phase()).toBe('ready');
    expect(state.request()).toBe('interrupted');
    expect(state.latestSchedule()).toBe(previous);
  });

  it.each([
    [new PlanningHttpError(403), 'forbidden'],
    [new PlanningHttpError(404), 'missing'],
    [new PlanningHttpError(503), 'unavailable'],
    [new AuthenticationRequired(), 'expired'],
  ])('traduit un échec de lecture (%s) en état %s', async (error, phase) => {
    gateway.site.mockRejectedValue(error);

    await state.open(SITE, MONDAY);

    expect(state.phase()).toBe(phase);
    expect(state.catalog()).toBeUndefined();
  });

  it('refuse un lancement que l’API rejette (422), sans retenter la même clé', async () => {
    gateway.start.mockRejectedValueOnce(new PlanningHttpError(422));
    gateway.start.mockResolvedValue(generation('A', 'SUCCEEDED', 'OPTIMAL'));
    await state.open(SITE, MONDAY);

    await state.generate();
    expect(state.request()).toBe('rejected');
    await state.generate();

    expect(gateway.start.mock.calls.map((call) => call[1])).toEqual(['clé-1', 'clé-2']);
  });

  it('ouvre la semaine demandée avant que le compte soit connu, dès qu’il l’est', async () => {
    const early = new PlanningState(gateway as unknown as PlanningGateway, () => 'clé');

    await early.open(SITE, MONDAY);
    expect(gateway.site).not.toHaveBeenCalled();
    await early.identify(manager);
    await vi.waitFor(() => expect(early.phase()).toBe('ready'));

    expect(gateway.week).toHaveBeenCalledWith(SITE, MONDAY, expect.any(AbortSignal));
  });

  it('n’ouvre rien pour un salarié, et vide tout au changement de compte', async () => {
    gateway.week.mockResolvedValue({
      latestAttempt: generation('A', 'SUCCEEDED', 'OPTIMAL'),
      latestSchedule: generation('A', 'SUCCEEDED', 'OPTIMAL'),
    });
    await state.open(SITE, MONDAY);

    await state.identify({ ...manager, subject: 'employee-A', roles: ['employee'] });

    expect(state.phase()).toBe('forbidden');
    expect(state.latestSchedule()).toBeNull();
    expect(state.catalog()).toBeUndefined();
    await state.open(SITE, MONDAY);
    expect(gateway.site).toHaveBeenCalledOnce();
  });
});
