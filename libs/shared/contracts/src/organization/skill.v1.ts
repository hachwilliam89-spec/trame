import { z } from 'zod';
import { pageOfV1 } from '../common/page.v1';
import { requiredText } from '../common/text.v1';

export const createSkillRequestV1 = z.object({
  name: requiredText(100),
});
export type CreateSkillRequestV1 = z.infer<typeof createSkillRequestV1>;

export const skillV1 = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});
export type SkillV1 = z.infer<typeof skillV1>;
export const skillPageV1 = pageOfV1(skillV1);
export type SkillPageV1 = z.infer<typeof skillPageV1>;
