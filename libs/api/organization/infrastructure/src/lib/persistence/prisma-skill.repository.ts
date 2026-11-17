import { Injectable } from '@nestjs/common';
import type { SkillRepository } from '@trame/api/organization/application';
import { Skill, SkillInUseError } from '@trame/api/organization/domain';
import {
  type Prisma,
  DatabaseContext,
  dateToInstant,
  instantToDate,
  isForeignKeyViolation,
} from '@trame/api/database';
import { type Page, type PageRequest, pageFrom } from '@trame/platform/pagination';
import { afterCursor } from './after-cursor';

/** Compétences dans `organization.skills`. */
@Injectable()
export class PrismaSkillRepository implements SkillRepository {
  constructor(private readonly database: DatabaseContext) {}

  async add(skill: Skill): Promise<void> {
    await this.database.client.skill.create({
      data: {
        id: skill.id,
        organizationId: skill.organizationId,
        name: skill.name,
        createdAt: instantToDate(skill.createdAt),
      },
    });
  }

  async findById(organizationId: string, skillId: string): Promise<Skill | undefined> {
    const record = await this.database.client.skill.findFirst({
      where: { id: skillId, organizationId },
    });
    if (record === null) {
      return undefined;
    }
    return toSkill(record);
  }

  async list(organizationId: string, page: PageRequest): Promise<Page<Skill>> {
    const records = await this.database.client.skill.findMany({
      where: { organizationId, id: afterCursor(page.after) },
      orderBy: { id: 'asc' },
      take: page.limit + 1,
    });
    return pageFrom(records.map(toSkill), page.limit);
  }

  async allExist(organizationId: string, skillIds: readonly string[]): Promise<boolean> {
    const count = await this.database.client.skill.count({
      where: { organizationId, id: { in: [...skillIds] } },
    });
    return count === skillIds.length;
  }

  async remove(organizationId: string, skillId: string): Promise<boolean> {
    try {
      // Filet de la règle vérifiée par le use case : un poste créé entre-temps fait échouer la
      // suppression par la clé étrangère `ON DELETE RESTRICT`.
      const result = await this.database.client.skill.deleteMany({
        where: { id: skillId, organizationId },
      });
      return result.count > 0;
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new SkillInUseError();
      }
      throw error;
    }
  }
}

function toSkill(record: Prisma.SkillModel): Skill {
  return Skill.create({ ...record, createdAt: dateToInstant(record.createdAt) });
}
