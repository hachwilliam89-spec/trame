import { describe, expect, it } from 'vitest';
import { evaluateResults } from './evaluate-results';
import type { EvaluationCase, Observation } from './scenario';

const replacementCase: EvaluationCase = {
  id: 'replacement',
  split: 'evaluation',
  description: 'Deux remplacements admissibles renvoyés par les outils simulés.',
  context: {
    organizationId: 'organization-a',
    siteId: 'site-a',
    slotId: 'slot-morning',
    note: 'Proposer un remplacement après une absence.',
  },
  simulatedTools: {
    candidateIds: ['employee-101', 'employee-102'],
    facts: [{ id: 'coverage-gap', description: 'Un poste reste à couvrir.' }],
  },
  expected: { outcomes: ['proposed', 'clarification'] },
};

function validObservation(): Observation {
  return {
    caseId: 'replacement',
    outcome: 'proposed',
    candidateId: 'employee-102',
    factIds: ['coverage-gap'],
    observedWrites: 0,
  };
}

describe('evaluateResults', () => {
  it('accepte chaque remplacement admissible et indique les outils simulés', () => {
    const report = evaluateResults([replacementCase], [validObservation()], 'evaluation');

    expect(report).toEqual({
      split: 'evaluation',
      simulatedTools: true,
      passed: 1,
      failed: 0,
      cases: [{ caseId: 'replacement', passed: true, errors: [] }],
    });
  });

  it.each([
    { candidateId: 'employee-excluded' },
    { factIds: ['qualification-invented'] },
    { observedWrites: 1 },
    { outcome: 'no_candidate' },
  ])('détecte un écart de comportement : %j', (change) => {
    const result = { ...validObservation(), ...change };
    const report = evaluateResults([replacementCase], [result], 'evaluation');

    expect(report.passed).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.cases[0]?.errors.length).toBeGreaterThan(0);
  });

  it('exige un candidat pour une proposition', () => {
    const observation = validObservation();
    delete observation.candidateId;

    expect(evaluateResults([replacementCase], [observation], 'evaluation').failed).toBe(1);
  });

  it('exige au moins un fait pour expliquer une proposition', () => {
    const observation = { ...validObservation(), factIds: [] };

    expect(evaluateResults([replacementCase], [observation], 'evaluation').failed).toBe(1);
  });

  it('accepte une précision pertinente sans candidat ni fait inventé', () => {
    const ambiguousCase: EvaluationCase = {
      ...replacementCase,
      expected: { outcomes: ['clarification'], clarification: 'site' },
    };
    const observation = {
      caseId: 'replacement',
      outcome: 'clarification',
      clarification: 'site',
      factIds: [],
      observedWrites: 0,
    };

    expect(evaluateResults([ambiguousCase], [observation], 'evaluation').passed).toBe(1);
  });

  it('accepte un arrêt explicite correspondant à la panne simulée', () => {
    const stoppedCase: EvaluationCase = {
      ...replacementCase,
      expected: { outcomes: ['stopped'], stopReason: 'provider_unavailable' },
    };
    const observation = {
      caseId: 'replacement',
      outcome: 'stopped',
      stopReason: 'provider_unavailable',
      factIds: [],
      observedWrites: 0,
    };

    expect(evaluateResults([stoppedCase], [observation], 'evaluation').passed).toBe(1);
  });

  it('refuse un candidat porté par une issue sans proposition', () => {
    const noCandidateCase: EvaluationCase = {
      ...replacementCase,
      expected: { outcomes: ['no_candidate'] },
    };
    const observation = { ...validObservation(), outcome: 'no_candidate' };

    expect(evaluateResults([noCandidateCase], [observation], 'evaluation').failed).toBe(1);
  });

  it.each([
    [],
    [validObservation(), validObservation()],
    [{ ...validObservation(), caseId: 'unknown-case' }],
    [{ ...validObservation(), observedWrites: -1 }],
    [{ ...validObservation(), outcome: 'unknown-outcome' }],
    [{ ...validObservation(), unexpectedField: true }],
    null,
  ])('refuse une campagne manquante, ambiguë ou mal formée : %j', (results) => {
    expect(() => evaluateResults([replacementCase], results, 'evaluation')).toThrow();
  });

  it('ne permet pas de sélectionner un ensemble vide pour obtenir un succès', () => {
    expect(() => evaluateResults([replacementCase], [], 'calibration')).toThrow();
  });

  it('ne garde que les cas du jeu demandé', () => {
    const calibrationCase = {
      ...replacementCase,
      id: 'calibration-replacement',
      split: 'calibration' as const,
    };

    const report = evaluateResults(
      [replacementCase, calibrationCase],
      [validObservation()],
      'evaluation',
    );

    expect(report.cases.map((result) => result.caseId)).toEqual(['replacement']);
  });

  it('exige la bonne précision sur une demande ambiguë', () => {
    const ambiguousCase: EvaluationCase = {
      ...replacementCase,
      expected: { outcomes: ['clarification'], clarification: 'site' },
    };
    const observation = {
      caseId: 'replacement',
      outcome: 'clarification',
      clarification: 'slot',
      factIds: [],
      observedWrites: 0,
    };

    expect(evaluateResults([ambiguousCase], [observation], 'evaluation').failed).toBe(1);
  });

  it('exige le motif correspondant pour un arrêt', () => {
    const stoppedCase: EvaluationCase = {
      ...replacementCase,
      expected: { outcomes: ['stopped'], stopReason: 'time_limit' },
    };
    const observation = {
      caseId: 'replacement',
      outcome: 'stopped',
      stopReason: 'provider_unavailable',
      factIds: [],
      observedWrites: 0,
    };

    expect(evaluateResults([stoppedCase], [observation], 'evaluation').failed).toBe(1);
  });
});
