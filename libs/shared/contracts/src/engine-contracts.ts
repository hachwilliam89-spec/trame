import { z } from 'zod';
import { diagnosticRequestedV1 } from './scheduling/diagnostic-requested.v1';
import { engineHealthV1 } from './engine/engine-health.v1';

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
} as const satisfies Record<string, z.ZodType>;

const registry = z.registry<{ id: string }>();
for (const [id, schema] of Object.entries(engineContracts)) {
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
