import { diagnosticReportedV1 } from './scheduling/diagnostic-report.v1';
import { diagnosticTopologyV1 } from './scheduling/diagnostic-topology.v1';
import { z } from 'zod';
import { diagnosticRequestedV1 } from './scheduling/diagnostic-requested.v1';
import { engineHealthV1 } from './engine/engine-health.v1';
import { scheduleReportedV1 } from './scheduling/schedule-reported.v1';
import { scheduleRequestedV1 } from './scheduling/schedule-requested.v1';
import { scheduleTopologyV1 } from './scheduling/schedule-topology.v1';
import { queueDeclarationV1 } from './scheduling/queue-topology.v1';
import {
  contractualVolumeRuleV1,
  maximumDailyDurationRuleV1,
  maximumWeeklyDurationRuleV1,
  minimumDailyRestRuleV1,
  requiredQualificationRuleV1,
  schedulingProblemV1,
  singleShiftRuleV1,
} from './scheduling/scheduling-problem.v1';

/**
 * Registre des contrats échangés entre l'API et le moteur Python.
 *
 * Chaque schéma enregistré ici est exporté en JSON Schema, puis converti en modèle Pydantic
 * par `pnpm nx run contracts:generate`. Il doit donc rester exportable : pas de `transform`,
 * pas de validation personnalisée, pas de `z.date()` (les dates circulent en ISO 8601).
 */
export const engineContracts = {
  EngineHealthV1: engineHealthV1,
  DiagnosticRequestedV1: diagnosticRequestedV1,
  DiagnosticReportedV1: diagnosticReportedV1,
  DiagnosticTopologyV1: diagnosticTopologyV1,
  ScheduleRequestedV1: scheduleRequestedV1,
  ScheduleReportedV1: scheduleReportedV1,
  ScheduleTopologyV1: scheduleTopologyV1,
} as const satisfies Record<string, z.ZodType>;

/**
 * Sous-schémas nommés : ils deviennent des classes Pydantic à leur nom, au lieu de noms déduits
 * des champs (`Rule3`, `Problem1`). Le moteur les manipule directement. Ce ne sont pas des messages :
 * leurs exemples vivent dans les fixtures des contrats qui les contiennent.
 */
export const engineContractParts = {
  SchedulingProblemV1: schedulingProblemV1,
  RequiredQualificationRuleV1: requiredQualificationRuleV1,
  SingleShiftRuleV1: singleShiftRuleV1,
  MinimumDailyRestRuleV1: minimumDailyRestRuleV1,
  MaximumDailyDurationRuleV1: maximumDailyDurationRuleV1,
  MaximumWeeklyDurationRuleV1: maximumWeeklyDurationRuleV1,
  ContractualVolumeRuleV1: contractualVolumeRuleV1,
  QueueDeclarationV1: queueDeclarationV1,
} as const satisfies Record<string, z.ZodType>;

const registry = z.registry<{ id: string }>();
for (const [id, schema] of Object.entries({ ...engineContracts, ...engineContractParts })) {
  registry.add(schema, { id });
}

/**
 * Document JSON Schema unique : un `$defs` par contrat, références internes en `#/$defs/<id>`.
 * Mode `input` : décrit ce qu'un destinataire accepte (les champs inconnus sont ignorés des deux côtés).
 */
export function engineContractsJsonSchema(): Record<string, unknown> {
  const { schemas } = z.toJSONSchema(registry, {
    target: 'draft-2020-12',
    io: 'input',
    uri: (id) => `#/$defs/${id}`,
  });

  // Chaque schéma exporté porte son propre `$schema` et son `$id` : on les retire, puisqu'ils
  // deviennent des entrées du même document. Tri par nom pour un fichier généré stable.
  const defs: Record<string, unknown> = {};
  const ids = Object.keys(schemas).sort((a, b) => a.localeCompare(b));
  for (const id of ids) {
    const { $schema: _schema, $id: _id, ...definition } = schemas[id] ?? {};
    defs[id] = definition;
  }

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'TrameEngineContracts',
    $defs: defs,
  };
}
