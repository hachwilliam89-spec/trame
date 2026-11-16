import * as z from 'zod';
import { scheduleFailureV1, scheduleOutcomeV1 } from './schedule-reported.v1';
import { solveParametersV1 } from './schedule-requested.v1';
import { schedulingProblemV1 } from './scheduling-problem.v1';

/** Corps de `POST /api/v1/schedule-generations` : le site et le lundi de la semaine, rien d'autre. */
export const startScheduleGenerationRequestV1 = z.strictObject({
  siteId: z.uuid(),
  weekStartsOn: z.iso.date(),
});

export type StartScheduleGenerationRequestV1 = z.infer<typeof startScheduleGenerationRequestV1>;

/** État du traitement ; l'issue du solveur (cinq issues, ADR-0020) est portée par `outcome`. */
export const scheduleGenerationStatusV1 = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']);

/** Salarié du site laissé hors du calcul, avec le motif que l'écran explique. */
export const excludedEmployeeV1 = z.object({
  employeeId: z.uuid(),
  /** Aucun contrat ne couvre toute la semaine (décision du 16 novembre 2026). */
  reason: z.enum(['NO_CONTRACT_COVERING_WEEK']),
});

/**
 * Une génération et l'instantané qu'elle a calculé : créneaux, besoins, horaires, minutes
 * effectives, habilitations et volumes contractuels. Un besoin modifié après le calcul ne change
 * donc pas la couverture affichée d'un ancien planning. Les noms restent dans `staff` et
 * `organization` : aucune donnée nominative n'est copiée dans `scheduling`.
 */
export const scheduleGenerationV1 = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  weekStartsOn: z.iso.date(),
  status: scheduleGenerationStatusV1,
  problem: schedulingProblemV1,
  parameters: solveParametersV1,
  excludedEmployees: z.array(excludedEmployeeV1),
  createdAt: z.iso.datetime(),
  outcome: scheduleOutcomeV1.optional(),
  failure: scheduleFailureV1.optional(),
  finishedAt: z.iso.datetime().optional(),
});

export type ScheduleGenerationV1 = z.infer<typeof scheduleGenerationV1>;

/** Paramètres de `GET /api/v1/schedule-generations` : le site et le lundi de la semaine. */
export const weekScheduleGenerationsQueryV1 = z.object({
  siteId: z.uuid(),
  weekStartsOn: z.iso.date(),
});

export type WeekScheduleGenerationsQueryV1 = z.infer<typeof weekScheduleGenerationsQueryV1>;

/** Les générations d'une semaine, retrouvées après un rechargement. */
export const weekScheduleGenerationsV1 = z.object({
  /** Dernière génération lancée, quel que soit son état. `null` : aucune. */
  latestAttempt: scheduleGenerationV1.nullable(),
  /**
   * Dernière génération terminée avec un planning (`OPTIMAL` ou `FEASIBLE`) : il reste affiché
   * pendant qu'un nouveau calcul tourne. `null` : aucune.
   */
  latestSchedule: scheduleGenerationV1.nullable(),
});

export type WeekScheduleGenerationsV1 = z.infer<typeof weekScheduleGenerationsV1>;
