import { PruneDiagnosticProgress } from '@trame/api/scheduling/application';
import { FixedClock } from '@trame/platform/clock';
import { DiagnosticEventRetention } from './diagnostic-event-retention';

describe('Nettoyage périodique des événements', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('nettoie au démarrage, ne superpose pas les appels et s’arrête avec le module', async () => {
    let release: ((count: number) => void) | undefined;
    const purge = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          release = resolve;
        }),
    );
    const progress = { read: async () => undefined, purgeFinishedBefore: purge };
    const retention = new DiagnosticEventRetention(
      new PruneDiagnosticProgress(progress, new FixedClock('2026-11-05T10:00:00Z')),
    );
    retention.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(purge).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(purge).toHaveBeenCalledTimes(1);
    release?.(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(purge).toHaveBeenCalledTimes(2);
    release?.(0);
    await retention.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(purge).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
