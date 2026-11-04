import type { DiagnosticRun } from '../index';
import type { DiagnosticReportV1 } from '@trame/shared/contracts';
import { advanceDiagnostic } from './advance-diagnostic';
const now = Temporal.Instant.from('2026-11-04T10:00:00Z');
const queued: DiagnosticRun = {
  id: 'run',
  organizationId: 'organization',
  status: 'QUEUED',
  createdAt: now,
};
const problem = {
  name: 'assignment-smoke-v1' as const,
  costs: [
    [4, 1, 3],
    [2, 0, 5],
    [3, 2, 2],
  ],
};
const parameters = { workers: 1 as const, seed: 0 as const, timeLimitSeconds: 5 as const };
it('commence le traitement une seule fois', () => {
  const running = advanceDiagnostic(queued, { kind: 'STARTED' }, now);
  expect(running?.status).toBe('RUNNING');
  expect(
    advanceDiagnostic({ ...queued, status: 'RUNNING' }, { kind: 'STARTED' }, now),
  ).toBeUndefined();
});
it.each(['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'UNKNOWN', 'CANCELLED'] as const)(
  'conserve explicitement l’issue %s',
  (status) => {
    const solution =
      status === 'OPTIMAL' || status === 'FEASIBLE' ? { cost: 5, assignment: [1, 0, 2] } : null;
    const report = {
      kind: 'RESULT',
      outcome: { result: { status, solution }, problem, parameters },
    } as DiagnosticReportV1;
    const finished = advanceDiagnostic(queued, report, now);
    expect(finished).toMatchObject({
      status: 'SUCCEEDED',
      outcome: report.kind === 'RESULT' ? report.outcome : undefined,
      finishedAt: now,
    });
  },
);
it('conserve un échec et ne remplace ni résultat terminal ni échec', () => {
  const failed = advanceDiagnostic(queued, { kind: 'FAILED', code: 'INVALID_MODEL' }, now);
  expect(failed).toMatchObject({ status: 'FAILED', failure: 'INVALID_MODEL', finishedAt: now });
  for (const status of ['SUCCEEDED', 'FAILED'] as const) {
    for (const report of [
      { kind: 'STARTED' },
      { kind: 'FAILED', code: 'PROCESSING_FAILED' },
    ] as const) {
      expect(advanceDiagnostic({ ...queued, status }, report, now)).toBeUndefined();
    }
  }
});
