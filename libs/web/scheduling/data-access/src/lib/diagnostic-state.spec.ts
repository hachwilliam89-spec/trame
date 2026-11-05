import { DiagnosticState } from './diagnostic-state';
import { DiagnosticHttpError, type DiagnosticGateway } from './diagnostic-api';
const runId = '0190f0a0-0000-7000-8000-000000000002';
const eventId = '0190f0a0-0000-7000-8000-000000000003';
const organizationId = '0190f0a0-0000-7000-8000-00000000000a';
const queued = { id: runId, status: 'QUEUED' as const, createdAt: '2026-11-05T10:00:00Z' };
const identity = { subject: 'user-A', organizationId, roles: ['manager'] };
function memory(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}
function gateway(): DiagnosticGateway {
  return {
    start: vi.fn(async () => queued),
    get: vi.fn(async () => queued),
    follow: vi.fn(async () => undefined),
  };
}
describe('État du diagnostic', () => {
  it('protège le double clic et réutilise la clé après perte de la réponse de création', async () => {
    const api = gateway();
    vi.mocked(api.start).mockRejectedValueOnce(new Error('network'));
    const state = new DiagnosticState(api, memory(), () => 'request-A');
    await state.identify(identity);
    await state.start();
    expect(state.phase()).toBe('disconnected');
    await state.start();
    expect(api.start).toHaveBeenNthCalledWith(1, 'request-A', expect.any(AbortSignal));
    expect(api.start).toHaveBeenNthCalledWith(2, 'request-A', expect.any(AbortSignal));
  });
  it('ne crée qu’une demande pour deux clics simultanés', async () => {
    const api = gateway();
    let resolveRun: ((run: typeof queued) => void) | undefined;
    vi.mocked(api.start).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );
    const state = new DiagnosticState(api, memory(), () => 'request-A');
    await state.identify(identity);
    const first = state.start();
    const second = state.start();
    expect(api.start).toHaveBeenCalledTimes(1);
    resolveRun?.(queued);
    await Promise.all([first, second]);
  });
  it('reprend après le dernier événement sans recréer le calcul', async () => {
    const api = gateway();
    vi.mocked(api.follow).mockImplementationOnce(async (_id, _after, receive) => {
      receive({
        id: eventId,
        runId,
        sequence: 1,
        occurredAt: queued.createdAt,
        report: { kind: 'STARTED' },
      });
      throw new Error('network');
    });
    const state = new DiagnosticState(api, memory(), () => 'request-A');
    await state.identify(identity);
    await state.start();
    expect(state.phase()).toBe('disconnected');
    await state.resume();
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(api.follow).toHaveBeenLastCalledWith(
      runId,
      eventId,
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });
  it('retrouve le job après recréation de la page, en isolant les identités', async () => {
    const api = gateway();
    const storage = memory();
    const first = new DiagnosticState(api, storage, () => 'request-A');
    await first.identify(identity);
    await first.start();
    const second = new DiagnosticState(api, storage, () => 'request-B');
    await second.identify(identity);
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(runId, expect.any(AbortSignal));
    await second.identify({ ...identity, organizationId: runId });
    expect(second.run()).toBeUndefined();
    expect(second.phase()).toBe('ready');
  });
  it('ne réaffiche pas la réponse tardive d’une ancienne organisation', async () => {
    const api = gateway();
    let resolveRun: ((value: typeof queued) => void) | undefined;
    vi.mocked(api.start).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );
    const state = new DiagnosticState(api, memory(), () => 'request-A');
    await state.identify(identity);
    const pending = state.start();
    await state.identify({ ...identity, subject: 'user-B' });
    resolveRun?.(queued);
    await pending;
    expect(state.run()).toBeUndefined();
    expect(api.follow).not.toHaveBeenCalled();
  });
  it('refuse le lancement à un employé et transforme 401 en reconnexion', async () => {
    const api = gateway();
    const state = new DiagnosticState(api, memory(), () => 'request-A');
    await state.identify({ ...identity, roles: ['employee'] });
    await state.start();
    expect(api.start).not.toHaveBeenCalled();
    expect(state.phase()).toBe('forbidden');
    await state.identify(identity);
    vi.mocked(api.start).mockRejectedValue(new DiagnosticHttpError(401));
    await state.start();
    expect(state.phase()).toBe('expired');
  });
  it('conserve le résultat quand seul l’historique a expiré', async () => {
    const api = gateway();
    const storage = memory();
    const first = new DiagnosticState(api, storage, () => 'request-A');
    await first.identify(identity);
    await first.start();
    vi.mocked(api.follow).mockRejectedValue(new DiagnosticHttpError(410));
    const second = new DiagnosticState(api, storage, () => 'request-B');
    await second.identify(identity);
    expect(second.historyExpired()).toBe(true);
    expect(second.run()?.id).toBe(runId);
  });
});
