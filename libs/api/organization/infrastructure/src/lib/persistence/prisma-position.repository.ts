import { Injectable } from '@nestjs/common';
import {
  type PositionRepository,
  PositionReferenceNotFoundError,
} from '@trame/api/organization/application';
import { Position } from '@trame/api/organization/domain';
import {
  type Prisma,
  PrismaService,
  dateToInstant,
  instantToDate,
  isForeignKeyViolation,
} from '@trame/api/database';
import { type Page, type PageRequest, pageFrom } from '@trame/platform/pagination';
import { afterCursor } from './after-cursor';

type PositionRecord = Prisma.PositionModel & { skills: { skillId: string }[] };

/** Postes dans `organization.positions`, et leurs compétences requises dans `position_skills`. */
@Injectable()
export class PrismaPositionRepository implements PositionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async add(position: Position): Promise<void> {
    const requirements = position.skillIds.map((skillId) => ({
      positionId: position.id,
      organizationId: position.organizationId,
      skillId,
    }));
    try {
      // Les identifiants sont déjà attribués : les deux écritures partagent la même transaction.
      await this.prisma.$transaction([
        this.prisma.position.create({
          data: {
            id: position.id,
            organizationId: position.organizationId,
            siteId: position.siteId,
            name: position.name,
            createdAt: instantToDate(position.createdAt),
          },
        }),
        this.prisma.positionSkill.createMany({ data: requirements }),
      ]);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new PositionReferenceNotFoundError();
      }
      throw error;
    }
  }

  async findById(
    organizationId: string,
    siteId: string,
    positionId: string,
  ): Promise<Position | undefined> {
    const record = await this.prisma.position.findFirst({
      where: { id: positionId, organizationId, siteId },
      include: { skills: { where: { organizationId }, select: { skillId: true } } },
    });
    if (record === null) {
      return undefined;
    }
    return toPosition(record);
  }

  async listBySite(
    organizationId: string,
    siteId: string,
    page: PageRequest,
  ): Promise<Page<Position>> {
    const records = await this.prisma.position.findMany({
      where: { organizationId, siteId, id: afterCursor(page.after) },
      include: { skills: { where: { organizationId }, select: { skillId: true } } },
      orderBy: { id: 'asc' },
      take: page.limit + 1,
    });
    return pageFrom(records.map(toPosition), page.limit);
  }

  async isSkillRequired(organizationId: string, skillId: string): Promise<boolean> {
    const count = await this.prisma.positionSkill.count({ where: { organizationId, skillId } });
    return count > 0;
  }
}

function toPosition(record: PositionRecord): Position {
  return Position.create({
    id: record.id,
    organizationId: record.organizationId,
    siteId: record.siteId,
    name: record.name,
    skillIds: record.skills.map((skill) => skill.skillId),
    createdAt: dateToInstant(record.createdAt),
  });
}
