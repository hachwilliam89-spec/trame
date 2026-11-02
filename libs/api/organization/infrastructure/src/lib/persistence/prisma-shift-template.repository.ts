import { Injectable } from '@nestjs/common';
import type { ShiftTemplateRepository } from '@trame/api/organization/application';
import {
  ShiftBreak,
  ShiftTemplate,
  ShiftTemplateLabelAlreadyUsedError,
} from '@trame/api/organization/domain';
import {
  type Prisma,
  PrismaService,
  dateToInstant,
  instantToDate,
  isUniqueViolation,
} from '@trame/api/database';
import { type Page, type PageRequest, pageFrom } from '@trame/platform/pagination';
import { afterCursor } from './after-cursor';
import { fromMinutesSinceMidnight, toMinutesSinceMidnight } from './local-time-minutes';

/** Créneaux types dans la table `organization.shift_templates`. */
@Injectable()
export class PrismaShiftTemplateRepository implements ShiftTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async add(shiftTemplate: ShiftTemplate): Promise<void> {
    try {
      await this.prisma.shiftTemplate.create({ data: toRecord(shiftTemplate) });
    } catch (error) {
      // Deux créations simultanées : la contrainte d'unicité tranche.
      if (isUniqueViolation(error)) {
        throw new ShiftTemplateLabelAlreadyUsedError(shiftTemplate.label);
      }
      throw error;
    }
  }

  async existsWithLabel(organizationId: string, siteId: string, label: string): Promise<boolean> {
    const count = await this.prisma.shiftTemplate.count({
      where: { organizationId, siteId, label },
    });
    return count > 0;
  }

  async findById(
    organizationId: string,
    siteId: string,
    shiftTemplateId: string,
  ): Promise<ShiftTemplate | undefined> {
    const record = await this.prisma.shiftTemplate.findFirst({
      where: { id: shiftTemplateId, organizationId, siteId },
    });
    if (record === null) {
      return undefined;
    }
    return toShiftTemplate(record);
  }

  async listBySite(
    organizationId: string,
    siteId: string,
    page: PageRequest,
  ): Promise<Page<ShiftTemplate>> {
    const records = await this.prisma.shiftTemplate.findMany({
      where: { organizationId, siteId, id: afterCursor(page.after) },
      orderBy: { id: 'asc' },
      take: page.limit + 1,
    });
    return pageFrom(records.map(toShiftTemplate), page.limit);
  }
}

function toRecord(shiftTemplate: ShiftTemplate): Prisma.ShiftTemplateModel {
  const shiftBreak = shiftTemplate.break;
  return {
    id: shiftTemplate.id,
    organizationId: shiftTemplate.organizationId,
    siteId: shiftTemplate.siteId,
    label: shiftTemplate.label,
    startMinute: toMinutesSinceMidnight(shiftTemplate.start),
    endMinute: toMinutesSinceMidnight(shiftTemplate.end),
    breakStartMinute: shiftBreak === null ? null : toMinutesSinceMidnight(shiftBreak.start),
    breakDurationMinutes: shiftBreak === null ? null : shiftBreak.durationMinutes,
    createdAt: instantToDate(shiftTemplate.createdAt),
  };
}

function toShiftTemplate(record: Prisma.ShiftTemplateModel): ShiftTemplate {
  return ShiftTemplate.create({
    id: record.id,
    organizationId: record.organizationId,
    siteId: record.siteId,
    label: record.label,
    start: fromMinutesSinceMidnight(record.startMinute),
    end: fromMinutesSinceMidnight(record.endMinute),
    break: toShiftBreak(record),
    createdAt: dateToInstant(record.createdAt),
  });
}

/** La contrainte `shift_templates_break_check` garantit que les deux colonnes sont nulles ensemble. */
function toShiftBreak(record: Prisma.ShiftTemplateModel): ShiftBreak | null {
  if (record.breakStartMinute === null || record.breakDurationMinutes === null) {
    return null;
  }
  return ShiftBreak.of(
    fromMinutesSinceMidnight(record.breakStartMinute),
    record.breakDurationMinutes,
  );
}
