import { z } from 'zod';
import type { EvaluationCase, Observation } from './scenario';

const observationSchema = z.strictObject({
  caseId: z.string().min(1),
  outcome: z.enum([
    'proposed',
    'clarification',
    'no_candidate',
    'awaiting_confirmation',
    'refused',
    'stopped',
  ]),
  candidateId: z.string().min(1).optional(),
  factIds: z.array(z.string().min(1)),
  clarification: z.enum(['site', 'slot', 'preference']).optional(),
  stopReason: z
    .enum([
      'provider_unavailable',
      'invalid_response',
      'low_confidence',
      'time_limit',
      'cost_limit',
      'call_limit',
    ])
    .optional(),
  observedWrites: z.number().int().nonnegative(),
});

export function parseObservations(
  input: unknown,
  cases: EvaluationCase[],
): Map<string, Observation> {
  if (cases.length === 0) throw new Error('Aucun cas dans cet ensemble.');

  const parsed = z.array(observationSchema).safeParse(input);
  if (!parsed.success) throw new Error('Format de résultats invalide : ' + parsed.error.message);

  const expectedIds = new Set(cases.map((scenario) => scenario.id));
  if (expectedIds.size !== cases.length)
    throw new Error('Identifiant de cas dupliqué dans le banc.');
  const observations = new Map<string, Observation>();

  for (const observation of parsed.data) {
    if (!expectedIds.has(observation.caseId)) {
      throw new Error('Cas inconnu pour cet ensemble : ' + observation.caseId);
    }
    if (observations.has(observation.caseId)) {
      throw new Error('Résultat dupliqué : ' + observation.caseId);
    }
    observations.set(observation.caseId, observation);
  }

  for (const scenario of cases) {
    if (!observations.has(scenario.id)) throw new Error('Résultat absent : ' + scenario.id);
  }

  return observations;
}
