import { SkillInUseError } from '@trame/api/organization/domain';
import { SkillNotFoundError } from '../not-found.errors';
import type { PositionRepository } from '../ports/position.repository';
import type { SkillRepository } from '../ports/skill.repository';

export interface DeleteSkillCommand {
  organizationId: string;
  skillId: string;
}

/**
 * Supprime une compétence du catalogue. Règle métier (US-030) : une compétence exigée par un poste
 * ne peut pas être supprimée. La base l'interdit aussi (`ON DELETE RESTRICT`), ce qui couvre un poste
 * créé entre cette vérification et la suppression.
 */
export class DeleteSkill {
  constructor(
    private readonly skills: SkillRepository,
    private readonly positions: PositionRepository,
  ) {}

  async execute(command: DeleteSkillCommand): Promise<void> {
    const skillIsRequired = await this.positions.isSkillRequired(
      command.organizationId,
      command.skillId,
    );
    if (skillIsRequired) {
      throw new SkillInUseError();
    }

    const removed = await this.skills.remove(command.organizationId, command.skillId);
    if (!removed) {
      throw new SkillNotFoundError();
    }
  }
}
