import type { Skill } from '@trame/api/organization/domain';
import { SkillNotFoundError } from '../not-found.errors';
import type { SkillRepository } from '../ports/skill.repository';

export interface GetSkillQuery {
  organizationId: string;
  skillId: string;
}

/** Lit une compétence du catalogue de l'organisation. */
export class GetSkill {
  constructor(private readonly skills: SkillRepository) {}

  async execute(query: GetSkillQuery): Promise<Skill> {
    const skill = await this.skills.findById(query.organizationId, query.skillId);
    if (skill === undefined) {
      throw new SkillNotFoundError();
    }
    return skill;
  }
}
