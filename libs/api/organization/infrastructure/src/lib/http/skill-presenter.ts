import type { Skill } from '@trame/api/organization/domain';
import type { SkillV1 } from '@trame/shared/contracts';

export function toSkillV1(skill: Skill): SkillV1 {
  return {
    id: skill.id,
    name: skill.name,
    // Même précision que le stockage Prisma, dès la réponse de création.
    createdAt: skill.createdAt.toString({ fractionalSecondDigits: 3 }),
  };
}
