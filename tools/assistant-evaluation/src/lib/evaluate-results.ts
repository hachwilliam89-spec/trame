import type { EvaluationCase, EvaluationReport, Split } from './scenario';
import { parseObservations } from './parse-observations';
import { gradeObservation } from './grade-observation';

export function evaluateResults(
  cases: EvaluationCase[],
  input: unknown,
  split: Split,
): EvaluationReport {
  const selected = cases.filter((scenario) => scenario.split === split);
  const observations = parseObservations(input, selected);
  const results = selected.map((scenario) => {
    const observation = observations.get(scenario.id);
    if (!observation) throw new Error('Résultat absent : ' + scenario.id);
    const errors = gradeObservation(scenario, observation);
    return { caseId: scenario.id, passed: errors.length === 0, errors };
  });
  const passed = results.filter((result) => result.passed).length;
  return { split, simulatedTools: true, passed, failed: results.length - passed, cases: results };
}
