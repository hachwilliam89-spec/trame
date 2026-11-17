import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  scheduleGenerationProgressV1,
  scheduleGenerationV1,
  startScheduleGenerationRequestV1,
  weekScheduleGenerationsQueryV1,
  weekScheduleGenerationsV1,
} from './schedule-generation.v1';

const exchangedSchemas = {
  scheduleGenerationProgressV1,
  scheduleGenerationV1,
  startScheduleGenerationRequestV1,
  weekScheduleGenerationsQueryV1,
  weekScheduleGenerationsV1,
};

const SITE_ID = '0190f0a0-0000-7000-8000-0000000000d1';
const requested = JSON.parse(
  readFileSync(
    join(__dirname, '../../fixtures/ScheduleRequestedV1/valid/semaine-de-demonstration.json'),
    'utf8',
  ),
) as { payload: { problem: unknown; parameters: unknown } };

const queued = {
  id: '0190f0a0-0000-7000-8000-0000000000e1',
  siteId: SITE_ID,
  weekStartsOn: '2026-11-23',
  status: 'QUEUED',
  problem: requested.payload.problem,
  parameters: { timeLimitSeconds: 30, workers: 1, seed: 0 },
  excludedEmployees: [
    { employeeId: '0190f0a0-0000-7000-8000-000000000049', reason: 'NO_CONTRACT_COVERING_WEEK' },
  ],
  createdAt: '2026-11-16T21:00:00Z',
};

describe('contrats de la génération d’un planning', () => {
  it('exporte chaque schéma échangé en JSON Schema (ADR-0018)', () => {
    for (const schema of Object.values(exchangedSchemas)) {
      expect(() => z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' })).not.toThrow();
    }
  });

  it('lance une génération sur un site et le lundi d’une semaine, sans autre champ', () => {
    const request = { siteId: SITE_ID, weekStartsOn: '2026-11-23' };

    expect(startScheduleGenerationRequestV1.safeParse(request).success).toBe(true);
    expect(
      startScheduleGenerationRequestV1.safeParse({ ...request, organizationId: SITE_ID }).success,
    ).toBe(false);
    expect(startScheduleGenerationRequestV1.safeParse({ siteId: SITE_ID }).success).toBe(false);
  });

  it('donne l’instantané du calcul : créneaux, besoins, contrats et salariés écartés', () => {
    const parsed = scheduleGenerationV1.parse(queued);

    expect(parsed.problem.shifts[0]).toMatchObject({ effectiveMinutes: 420, requiredCount: 2 });
    expect(parsed.excludedEmployees).toHaveLength(1);
  });

  it('refuse un motif d’exclusion inconnu', () => {
    const unknownReason = {
      ...queued,
      excludedEmployees: [{ employeeId: SITE_ID, reason: 'AUTRE' }],
    };

    expect(scheduleGenerationV1.safeParse(unknownReason).success).toBe(false);
  });

  it('montre le dernier essai et le dernier planning exploitable d’une semaine', () => {
    const solved = {
      ...queued,
      id: '0190f0a0-0000-7000-8000-0000000000e0',
      status: 'SUCCEEDED',
      outcome: {
        result: { status: 'OPTIMAL', schedule: { assignments: [], shortfalls: [] } },
        checkedRules: ['HABILITATION_REQUISE'],
        solveSeconds: 0.4,
      },
      finishedAt: '2026-11-16T20:59:00Z',
    };

    expect(
      weekScheduleGenerationsV1.safeParse({ latestAttempt: queued, latestSchedule: solved })
        .success,
    ).toBe(true);
    expect(
      weekScheduleGenerationsV1.safeParse({ latestAttempt: null, latestSchedule: null }).success,
    ).toBe(true);
  });

  it('annonce la progression sans le planning, lu ensuite par la génération', () => {
    const finished = {
      id: '0190f0a0-0000-7000-8000-0000000000f2',
      generationId: queued.id,
      sequence: 2,
      occurredAt: '2026-11-16T21:00:02Z',
      status: 'SUCCEEDED',
      resultStatus: 'INFEASIBLE',
    };

    expect(scheduleGenerationProgressV1.safeParse(finished).success).toBe(true);
    expect(
      scheduleGenerationProgressV1.safeParse({
        ...finished,
        status: 'FAILED',
        failure: 'INVALID_MODEL',
      }).success,
    ).toBe(true);
    expect(scheduleGenerationProgressV1.safeParse({ ...finished, status: 'QUEUED' }).success).toBe(
      false,
    );
  });
});
