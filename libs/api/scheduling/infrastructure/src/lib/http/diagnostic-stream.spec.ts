import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { FixedClock } from '@trame/platform/clock';
import type { ProgressSnapshot } from '@trame/api/scheduling/application';
import { serveDiagnosticStream } from './diagnostic-stream';

class Client extends EventEmitter {
  chunks: string[] = [];
  writableNeedDrain = false;
  ended = false;
  write(chunk: string) {
    this.chunks.push(chunk);
    return !this.writableNeedDrain;
  }
  end() {
    this.ended = true;
    this.emit('close');
  }
  destroy() {
    this.end();
  }
}
const started = {
  id: '0190f0a0-0000-7000-8000-000000000001',
  runId: '0190f0a0-0000-7000-8000-000000000002',
  sequence: 1,
  occurredAt: '2026-11-05T10:00:00Z',
  report: { kind: 'STARTED' as const },
};
const failed = {
  ...started,
  id: '0190f0a0-0000-7000-8000-000000000003',
  sequence: 2,
  report: { kind: 'FAILED' as const, code: 'PROCESSING_FAILED' as const },
};

describe('Cycle de vie du flux SSE', () => {
  let clock: FixedClock;
  let client: Client;
  beforeEach(() => {
    vi.useFakeTimers();
    clock = new FixedClock('2026-11-05T10:00:00Z');
    client = new Client();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  function stream(initial: ProgressSnapshot, read = vi.fn(async () => initial), ttl = 60_000) {
    return serveDiagnosticStream({
      response: client as unknown as Response,
      clock,
      expiresAt: clock.now().epochMilliseconds + ttl,
      initial,
      read,
      onError: vi.fn(),
    });
  }
  it('émet des identifiants rejouables et termine après le résultat', async () => {
    await stream({ cursorKnown: true, events: [started, failed], finishedAt: clock.now() });
    expect(client.chunks.join('')).toContain(`id: ${started.id}\nevent: diagnostic\ndata: `);
    expect(client.chunks.join('')).toContain(JSON.stringify(failed));
    expect(client.ended).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('ferme à expiration même si la lecture suivante reste bloquée', async () => {
    let resolveRead: ((snapshot: ProgressSnapshot) => void) | undefined;
    const read = vi.fn(
      () =>
        new Promise<ProgressSnapshot>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const finished = stream({ cursorKnown: true, events: [] }, read, 2000);
    await vi.advanceTimersByTimeAsync(1000);
    clock.advance({ seconds: 2 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.ended).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    resolveRead?.({ cursorKnown: true, events: [failed] });
    await finished;
    expect(client.chunks.join('')).not.toContain(JSON.stringify(failed));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('envoie un maintien à 20 s et libère ses timers à la déconnexion', async () => {
    const finished = stream({ cursorKnown: true, events: [] });
    clock.advance({ seconds: 20 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(client.chunks.join('')).toContain(': keepalive\n\n');
    client.end();
    await finished;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('ne lit pas le lot suivant tant que le client est saturé et ferme à expiration', async () => {
    client.writableNeedDrain = true;
    const read = vi.fn(async () => ({ cursorKnown: true, events: [] }));
    const finished = stream({ cursorKnown: true, events: [started] }, read, 2000);
    clock.advance({ seconds: 2 });
    await vi.advanceTimersByTimeAsync(2000);
    await finished;
    expect(client.ended).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
