import { Injectable } from '@nestjs/common';
import type { SkillRepository } from '@trame/api/organization/application';
import { Skill, SkillInUseError } from '@trame/api/organization/domain';
import {
  type Prisma,
  PrismaService,
  dateToInstant,
  instantToDate,
  isForeignKeyViolation,
} from '@trame/api/database';
import { type Page, type PageRequest, pageFrom } from '@trame/platform/pagination';
import { afterCursor } from './after-cursor';

@Injectable()
export class PrismaSkillRepository implements SkillRepository {
  constructor(private readonly prisma: PrismaService) {}

  async add(skill: Skill): Promise<void> {
    await this.prisma.skill.create({
      data: {
        id: skill.id,
        organizationId: skill.organizationId,
        name: skill.name,
        createdAt: instantToDate(skill.createdAt),
      },
    });
  }

  async findById(organizationId: string, skillId: string): Promise<Skill | undefined> {
    const record = await this.prisma.skill.findFirst({ where: { id: skillId, organizationId } });
    if (record === null) {
      return undefined;
    }
    return toSkill(record);
  }

  async list(organizationId: string, page: PageRequest): Promise<Page<Skill>> {
    const records = await this.prisma.skill.findMany({
      where: { organizationId, id: afterCursor(page.after) },
      orderBy: { id: 'asc' },
      take: page.limit + 1,
    });
    return pageFrom(records.map(toSkill), page.limit);
  }

  async allExist(organizationId: string, skillIds: readonly string[]): Promise<boolean> {
    const count = await this.prisma.skill.count({
      where: { organizationId, id: { in: [...skillIds] } },
    });
    return count === skillIds.length;
  }

  async remove(organizationId: string, skillId: string): Promise<boolean> {
    try {
      // La clé étrangère RESTRICT protège aussi le cas d'une affectation concurrente à un poste.
      const result = await this.prisma.skill.deleteMany({ where: { id: skillId, organizationId } });
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
