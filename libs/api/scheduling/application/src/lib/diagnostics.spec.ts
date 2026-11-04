import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { IdempotencyKey } from '@trame/platform/idempotency';
import { InMemoryDiagnosticRuns } from '../testing';
import { StartDiagnostic } from './start-diagnostic';
import { GetDiagnostic, DiagnosticNotFoundError } from './get-diagnostic';

const organizationId = '0190f0a0-0000-7000-8000-00000000000a';
const anotherOrganizationId = '0190f0a0-0000-7000-8000-00000000000b';
const clock = new FixedClock('2026-11-04T10:00:00Z');

describe('Demander et consulter le diagnostic', () => {
  let runs: InMemoryDiagnosticRuns;
  let start: StartDiagnostic;
  beforeEach(() => {
    runs = new InMemoryDiagnosticRuns();
    start = new StartDiagnostic(runs, clock, new SequentialIdGenerator());
  });
  it('enregistre une attente et un seul message, sans exécuter le calcul', async () => {
    const run = await start.execute({ organizationId, key: IdempotencyKey.of('request-1') });
    expect(run).toEqual({
      id: '00000000-0000-7000-8000-000000000001',
      organizationId,
      status: 'QUEUED',
      createdAt: clock.now(),
    });
    const requests = [...runs.requests.values()];
    expect(requests).toHaveLength(1);
    expect(requests[0]?.message).toEqual({
      id: '00000000-0000-7000-8000-000000000002',
      organizationId,
      type: 'scheduling.diagnostic-requested.v1',
      occurredAt: clock.now().toString(),
      payload: { runId: run.id, problem: 'assignment-smoke-v1' },
    });
    expect(await new GetDiagnostic(runs).execute({ organizationId, runId: run.id })).toEqual(run);
  });
  it('retrouve le même job pour la même clé, y compris après une nouvelle instance du use case', async () => {
    const command = { organizationId, key: IdempotencyKey.of('same-request') };
    const first = await start.execute(command);
    const replay = await new StartDiagnostic(runs, clock, new SequentialIdGenerator()).execute(
      command,
    );
    expect(replay).toEqual(first);
    expect(runs.requests.size).toBe(1);
  });
  it('sépare les organisations utilisant la même clé', async () => {
    const first = await start.execute({ organizationId, key: IdempotencyKey.of('same-key') });
    const second = await start.execute({
      organizationId: anotherOrganizationId,
      key: IdempotencyKey.of('same-key'),
    });
    expect(second.id).not.toBe(first.id);
    expect(runs.requests.size).toBe(2);
    await expect(
      new GetDiagnostic(runs).execute({ organizationId: anotherOrganizationId, runId: first.id }),
    ).rejects.toThrow(DiagnosticNotFoundError);
  });
  it('refuse un job absent', async () => {
    await expect(
      new GetDiagnostic(runs).execute({ organizationId, runId: 'absent' }),
    ).rejects.toThrow(DiagnosticNotFoundError);
  });
});
