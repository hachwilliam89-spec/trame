import { z } from 'zod';
import { pageOfV1 } from '../common/page.v1';

export const createPositionRequestV1 = z.object({
  // PostgreSQL ne peut pas stocker le caractère NUL, même dans un nom autrement valide.
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/\S/)
    .regex(/^[^\0]*$/),
  /** Un ensemble d'identifiants ; le domaine refuse les doublons, y compris les variantes de casse. */
  skillIds: z.array(z.uuid()),
});
export type CreatePositionRequestV1 = z.infer<typeof createPositionRequestV1>;

export const positionV1 = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  name: z.string(),
  skillIds: z.array(z.uuid()),
  createdAt: z.iso.datetime(),
});
export type PositionV1 = z.infer<typeof positionV1>;
export const positionPageV1 = pageOfV1(positionV1);
export type PositionPageV1 = z.infer<typeof positionPageV1>;
