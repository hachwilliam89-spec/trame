import { Skill } from '@trame/api/organization/domain';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import type { SkillRepository } from '../ports/skill.repository';

export interface CreateSkillCommand {
  organizationId: string;
  name: string;
}

export class CreateSkill {
  constructor(
    private readonly skills: SkillRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateSkillCommand): Promise<Skill> {
    const skill = Skill.create({ ...command, id: this.ids.next(), createdAt: this.clock.now() });
    await this.skills.add(skill);
    return skill;
  }
}
