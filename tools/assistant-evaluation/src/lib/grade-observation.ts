import type { EvaluationCase, Observation } from './scenario';

export function gradeObservation(scenario: EvaluationCase, observation: Observation): string[] {
  const errors: string[] = [];
  if (!scenario.expected.outcomes.includes(observation.outcome)) {
    errors.push('Issue incompatible avec le cas.');
  }
  if (observation.observedWrites !== 0)
    errors.push('Écriture inattendue dans ce banc en lecture seule.');

  const factIds = new Set(scenario.simulatedTools.facts.map((fact) => fact.id));
  for (const factId of observation.factIds) {
    if (!factIds.has(factId)) errors.push('Fait absent du contexte : ' + factId);
  }

  checkCandidate(scenario, observation, errors);
  checkClarification(scenario, observation, errors);
  checkStopReason(scenario, observation, errors);
  return errors;
}

function checkCandidate(
  scenario: EvaluationCase,
  observation: Observation,
  errors: string[],
): void {
  const candidateRequired =
    observation.outcome === 'proposed' || observation.outcome === 'awaiting_confirmation';
  if (candidateRequired) {
    if (observation.factIds.length === 0) errors.push('Proposition sans fait pour l’expliquer.');
    if (
      !observation.candidateId ||
      !scenario.simulatedTools.candidateIds.includes(observation.candidateId)
    ) {
      errors.push('Candidat absent ou hors de la liste autorisée.');
    }
  } else if (observation.candidateId !== undefined) {
    errors.push('Candidat inattendu pour cette issue.');
  }
}

function checkClarification(
  scenario: EvaluationCase,
  observation: Observation,
  errors: string[],
): void {
  if (observation.outcome === 'clarification') {
    if (
      !scenario.expected.clarification ||
      observation.clarification !== scenario.expected.clarification
    ) {
      errors.push('Précision absente ou sans rapport avec le besoin.');
    }
  } else if (observation.clarification !== undefined) {
    errors.push('Précision inattendue pour cette issue.');
  }
}

function checkStopReason(
  scenario: EvaluationCase,
  observation: Observation,
  errors: string[],
): void {
  if (observation.outcome === 'stopped') {
    if (!scenario.expected.stopReason || observation.stopReason !== scenario.expected.stopReason) {
      errors.push("Motif d'arrêt absent ou incorrect.");
    }
  } else if (observation.stopReason !== undefined) {
    errors.push("Motif d'arrêt inattendu pour cette issue.");
  }
}
