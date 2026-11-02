import { z } from 'zod';

/**
 * Réponse de `GET /health` du moteur d'optimisation.
 * Contrat API ↔ moteur : le modèle Pydantic correspondant est généré (ADR-0018).
 */
export const engineHealthV1 = z
  .object({
    status: z.literal('ok'),
    engineVersion: z.string().min(1),
    ortoolsVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  })
  .describe("État du moteur d'optimisation.");

export type EngineHealthV1 = z.infer<typeof engineHealthV1>;
