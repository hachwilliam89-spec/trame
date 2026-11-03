import type { Skill } from '@trame/api/organization/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';
import type { SkillRepository } from '../ports/skill.repository';

export interface ListSkillsQuery {
  organizationId: string;
  page: PageRequest;
}

/** Liste le catalogue de l'organisation, par ordre de création. */
export class ListSkills {
  constructor(private readonly skills: SkillRepository) {}

  execute(query: ListSkillsQuery): Promise<Page<Skill>> {
    return this.skills.list(query.organizationId, query.page);
  }
}
