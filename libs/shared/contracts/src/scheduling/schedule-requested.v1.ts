import { z } from 'zod';
import { schedulingProblemV1 } from './scheduling-problem.v1';

/** Paramètres de CP-SAT, enregistrés avec la génération pour la rejouer à l'identique. */
export const solveParametersV1 = z.object({
  timeLimitSeconds: z.int().min(1).max(300),
  workers: z.int().min(1).max(8),
  seed: z.int().min(0).max(2_147_483_647),
});

export type SolveParametersV1 = z.infer<typeof solveParametersV1>;

/** Demande de génération du planning d'une semaine, publiée par l'API via l'outbox (ADR-0021). */
export const scheduleRequestedV1 = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  type: z.literal('scheduling.schedule-requested.v1'),
  occurredAt: z.iso.datetime({ offset: true }),
  payload: z.object({
    generationId: z.uuid(),
    problem: schedulingProblemV1,
    parameters: solveParametersV1,
  }),
});

export type ScheduleRequestedV1 = z.infer<typeof scheduleRequestedV1>;
