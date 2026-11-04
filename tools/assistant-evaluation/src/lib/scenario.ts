export type Outcome =
  'proposed' | 'clarification' | 'no_candidate' | 'awaiting_confirmation' | 'refused' | 'stopped';

export type StopReason =
  | 'provider_unavailable'
  | 'invalid_response'
  | 'low_confidence'
  | 'time_limit'
  | 'cost_limit'
  | 'call_limit';

export type Split = 'calibration' | 'evaluation';

export interface EvaluationCase {
  id: string;
  split: Split;
  description: string;
  context: {
    organizationId: string;
    siteId: string | null;
    slotId: string | null;
    note: string;
  };
  simulatedTools: {
    candidateIds: string[];
    facts: { id: string; description: string }[];
    event?: string;
  };
  expected: {
    outcomes: Outcome[];
    clarification?: 'site' | 'slot' | 'preference';
    stopReason?: StopReason;
  };
}

export interface Observation {
  caseId: string;
  outcome: Outcome;
  candidateId?: string;
  factIds: string[];
  clarification?: 'site' | 'slot' | 'preference';
  stopReason?: StopReason;
  observedWrites: number;
}

export interface EvaluationReport {
  split: Split;
  simulatedTools: true;
  passed: number;
  failed: number;
  cases: { caseId: string; passed: boolean; errors: string[] }[];
}
