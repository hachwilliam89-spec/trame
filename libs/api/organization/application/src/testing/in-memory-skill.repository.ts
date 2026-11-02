import type { Skill } from '@trame/api/organization/domain';
import { type Page, type PageRequest, pageOf } from '@trame/platform/pagination';
import type { SkillRepository } from '../lib/ports/skill.repository';

/** Dépôt en mémoire, pour les tests. */
export class InMemorySkillRepository implements SkillRepository {
  private readonly skills: Skill[] = [];

  async add(skill: Skill): Promise<void> {
    this.skills.push(skill);
  }

  async findById(organizationId: string, skillId: string): Promise<Skill | undefined> {
    return this.skills.find(
      (skill) => skill.organizationId === organizationId && skill.id === skillId,
    );
  }

  async list(organizationId: string, page: PageRequest): Promise<Page<Skill>> {
    return pageOf(
      this.skills.filter((skill) => skill.organizationId === organizationId),
      page,
    );
  }

  async allExist(organizationId: string, skillIds: readonly string[]): Promise<boolean> {
    return skillIds.every((skillId) =>
      this.skills.some((skill) => skill.organizationId === organizationId && skill.id === skillId),
    );
  }

  async remove(organizationId: string, skillId: string): Promise<boolean> {
    const index = this.skills.findIndex(
      (skill) => skill.organizationId === organizationId && skill.id === skillId,
    );
    if (index === -1) {
      return false;
    }
    this.skills.splice(index, 1);
    return true;
  }
}
