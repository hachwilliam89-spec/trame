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
    // DÉMONSTRATION US-003 : champ ajouté sans régénérer les modèles Pydantic.
    region: z.string().optional(),
  })
  .describe("État du moteur d'optimisation.");

export type EngineHealthV1 = z.infer<typeof engineHealthV1>;
