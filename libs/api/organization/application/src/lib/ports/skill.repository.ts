import type { Skill } from '@trame/api/organization/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';

export interface SkillRepository {
  add(skill: Skill): Promise<void>;
  findById(organizationId: string, skillId: string): Promise<Skill | undefined>;
  list(organizationId: string, page: PageRequest): Promise<Page<Skill>>;
  allExist(organizationId: string, skillIds: readonly string[]): Promise<boolean>;
  /** Suppression atomique : false si absente, SkillInUseError si utilisée, même en concurrence. */
  remove(organizationId: string, skillId: string): Promise<boolean>;
}
