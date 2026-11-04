import { describe, expect, it } from 'vitest';
import { evaluationCases } from './cases';

describe('jeux de cas', () => {
  it('ne présente aucune entrée du réglage dans l’ensemble d’évaluation', () => {
    const calibrationInputs = new Set(
      evaluationCases
        .filter((scenario) => scenario.split === 'calibration')
        .map((scenario) =>
          JSON.stringify({ context: scenario.context, tools: scenario.simulatedTools }),
        ),
    );
    for (const scenario of evaluationCases.filter((scenario) => scenario.split === 'evaluation')) {
      const input = JSON.stringify({ context: scenario.context, tools: scenario.simulatedTools });
      expect(calibrationInputs.has(input), scenario.id).toBe(false);
    }
  });
});
