import { SkillNotFoundError } from '../not-found.errors';
import type { SkillRepository } from '../ports/skill.repository';

export interface DeleteSkillCommand {
  organizationId: string;
  skillId: string;
}

export class DeleteSkill {
  constructor(private readonly skills: SkillRepository) {}
  async execute(command: DeleteSkillCommand): Promise<void> {
    const removed = await this.skills.remove(command.organizationId, command.skillId);
    if (!removed) {
      throw new SkillNotFoundError();
    }
  }
}
