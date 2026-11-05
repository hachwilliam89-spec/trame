import { FixedClock } from '@trame/platform/clock';
import { DiagnosticNotFoundError } from './get-diagnostic';
import {
  ReadDiagnosticProgress,
  PruneDiagnosticProgress,
  ProgressExpiredError,
  InvalidProgressCursorError,
  type DiagnosticProgress,
  type ProgressSnapshot,
} from './diagnostic-progress';

const query = { organizationId: 'organization-A', runId: 'job-A' };
describe('Reprise et rétention de la progression', () => {
  const clock = new FixedClock('2026-11-05T10:00:00Z');
  let snapshot: ProgressSnapshot | undefined;
  let progress: DiagnosticProgress;
  beforeEach(() => {
    snapshot = { cursorKnown: true, events: [] };
    progress = { read: vi.fn(async () => snapshot), purgeFinishedBefore: vi.fn(async () => 2) };
  });
  it('refuse un job absent ou étranger', async () => {
    snapshot = undefined;
    await expect(new ReadDiagnosticProgress(progress, clock).execute(query)).rejects.toBeInstanceOf(
      DiagnosticNotFoundError,
    );
  });
  it('refuse un curseur inconnu du job', async () => {
    snapshot = { cursorKnown: false, events: [] };
    await expect(
      new ReadDiagnosticProgress(progress, clock).execute({ ...query, after: 'unknown' }),
    ).rejects.toBeInstanceOf(InvalidProgressCursorError);
  });
  it('autorise la reprise juste avant une heure, puis la refuse à la limite exacte', async () => {
    snapshot = {
      cursorKnown: true,
      events: [],
      finishedAt: clock.now().subtract({ hours: 1 }).add({ milliseconds: 1 }),
    };
    const reader = new ReadDiagnosticProgress(progress, clock);
    await expect(reader.execute(query)).resolves.toEqual(snapshot);
    snapshot.finishedAt = clock.now().subtract({ hours: 1 });
    await expect(reader.execute(query)).rejects.toBeInstanceOf(ProgressExpiredError);
  });
  it('transmet organisation et curseur sans élargir la lecture', async () => {
    const reader = new ReadDiagnosticProgress(progress, clock);
    await reader.execute({ ...query, after: 'event-A' });
    expect(progress.read).toHaveBeenCalledWith({ ...query, after: 'event-A' });
  });
  it('purge uniquement les événements des jobs terminés depuis une heure', async () => {
    expect(await new PruneDiagnosticProgress(progress, clock).execute()).toBe(2);
    expect(progress.purgeFinishedBefore).toHaveBeenCalledWith(clock.now().subtract({ hours: 1 }));
  });
});
