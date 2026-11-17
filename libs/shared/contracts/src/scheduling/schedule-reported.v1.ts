import { z } from 'zod';
import { schedulingRuleIdV1 } from './scheduling-problem.v1';

/** Planning proposé : les affectations, et le manque chiffré de chaque shift sous-couvert. */
export const scheduleV1 = z.object({
  assignments: z.array(z.object({ shiftId: z.string().min(1).max(100), employeeId: z.uuid() })),
  shortfalls: z.array(
    z.object({
      shiftId: z.string().min(1).max(100),
      requiredCount: z.int().min(1).max(999),
      assignedCount: z.int().min(0).max(998),
    }),
  ),
});

/** Les cinq issues du solveur (ADR-0020) : un planning n'existe que pour celles qui en trouvent un. */
export const scheduleResultV1 = z.discriminatedUnion('status', [
  z.object({ status: z.literal('OPTIMAL'), schedule: scheduleV1 }),
  z.object({ status: z.literal('FEASIBLE'), schedule: scheduleV1 }),
  z.object({ status: z.literal('INFEASIBLE'), schedule: z.null() }),
  z.object({ status: z.literal('UNKNOWN'), schedule: z.null() }),
  z.object({ status: z.literal('CANCELLED'), schedule: scheduleV1.nullable() }),
]);

export const scheduleOutcomeV1 = z.object({
  result: scheduleResultV1,
  /** Règles appliquées par le moteur, pour l'écran « Règles vérifiées ». */
  checkedRules: z.array(schedulingRuleIdV1).min(1),
  /** Durée réelle de la résolution, en secondes. */
  solveSeconds: z.number().min(0),
});

export const scheduleFailureV1 = z.enum([
  'INVALID_MODEL',
  'PROCESSING_FAILED',
  'RETRIES_EXHAUSTED',
]);

export const scheduleReportV1 = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('STARTED') }),
  z.object({ kind: z.literal('RESULT'), outcome: scheduleOutcomeV1 }),
  z.object({ kind: z.literal('FAILED'), code: scheduleFailureV1 }),
]);

/** Rapport du moteur sur une génération, reçu par l'API via l'inbox (ADR-0021). */
export const scheduleReportedV1 = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  type: z.literal('scheduling.schedule-reported.v1'),
  occurredAt: z.iso.datetime({ offset: true }),
  payload: z.object({ generationId: z.uuid(), requestId: z.uuid(), report: scheduleReportV1 }),
});

export type ScheduleOutcomeV1 = z.infer<typeof scheduleOutcomeV1>;
export type ScheduleFailureV1 = z.infer<typeof scheduleFailureV1>;
export type ScheduleReportedV1 = z.infer<typeof scheduleReportedV1>;

export type ScheduleReportV1 = z.infer<typeof scheduleReportV1>;
