import { z } from 'zod';
import { pageOfV1 } from '../common/page.v1';
import { requiredText } from '../common/text.v1';

/** Création d'un poste : `POST /api/v1/sites/{siteId}/positions`. */
export const createPositionRequestV1 = z.object({
  name: requiredText(100),
  /** Un ensemble d'identifiants ; le domaine refuse les doublons, y compris les variantes de casse. */
  skillIds: z.array(z.uuid()),
});

export type CreatePositionRequestV1 = z.infer<typeof createPositionRequestV1>;

/** Un poste, tel que l'API le renvoie. Ses compétences sont triées : leur ordre n'a pas de sens métier. */
export const positionV1 = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  name: z.string(),
  skillIds: z.array(z.uuid()),
  createdAt: z.iso.datetime(),
});

export type PositionV1 = z.infer<typeof positionV1>;

/** Postes d'un site : `GET /api/v1/sites/{siteId}/positions`. */
export const positionPageV1 = pageOfV1(positionV1);

export type PositionPageV1 = z.infer<typeof positionPageV1>;
