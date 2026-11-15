import { Injectable } from '@nestjs/common';
import {
  type Prisma,
  PrismaService,
  dateToInstant,
  dateToPlainDate,
  instantToDate,
  plainDateToDate,
} from '@trame/api/database';
import type { WeeklyCoverageRepository } from '@trame/api/demand/application';
import { WeeklyCoverage } from '@trame/api/demand/domain';

type WeeklyCoverageRecord = Prisma.WeeklyCoverageModel & { needs: Prisma.CoverageNeedModel[] };

/** Semaines dans `demand.weekly_coverages`, et leurs besoins dans `demand.coverage_needs`. */
@Injectable()
export class PrismaWeeklyCoverageRepository implements WeeklyCoverageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(coverage: WeeklyCoverage): Promise<void> {
    const week = {
      organizationId: coverage.organizationId,
      siteId: coverage.siteId,
      weekStartsOn: plainDateToDate(coverage.weekStartsOn),
    };
    const needs = coverage.needs.map((need) => ({
      ...week,
      date: plainDateToDate(need.date),
      shiftTemplateId: need.shiftTemplateId,
      positionId: need.positionId,
      requiredCount: need.requiredCount,
    }));
    await this.prisma.$transaction(async (transaction) => {
      await upsertAndLockWeek(transaction, coverage);
      await transaction.coverageNeed.deleteMany({ where: week });
      await transaction.coverageNeed.createMany({ data: needs });
    });
  }

  async find(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<WeeklyCoverage | undefined> {
    const record = await this.prisma.weeklyCoverage.findUnique({
      where: {
        organizationId_siteId_weekStartsOn: {
          organizationId,
          siteId,
          weekStartsOn: plainDateToDate(weekStartsOn),
        },
      },
      include: { needs: true },
    });
    if (record === null) {
      return undefined;
    }
    return toWeeklyCoverage(record);
  }
}

/**
 * Crée la ligne de la semaine ou met à jour sa date, en une seule instruction. Dans les deux
 * cas, la transaction tient la ligne : deux remplacements simultanés de la même semaine passent
 * l'un après l'autre, et le dernier l'emporte en entier.
 */
async function upsertAndLockWeek(
  transaction: Prisma.TransactionClient,
  coverage: WeeklyCoverage,
): Promise<void> {
  await transaction.$executeRaw`
    INSERT INTO demand.weekly_coverages (organization_id, site_id, week_starts_on, updated_at)
    VALUES (
      ${coverage.organizationId}::uuid,
      ${coverage.siteId}::uuid,
      ${coverage.weekStartsOn.toString()}::date,
      ${instantToDate(coverage.updatedAt)}
    )
    ON CONFLICT (organization_id, site_id, week_starts_on)
    DO UPDATE SET updated_at = EXCLUDED.updated_at
  `;
}

function toWeeklyCoverage(record: WeeklyCoverageRecord): WeeklyCoverage {
  return WeeklyCoverage.create({
    organizationId: record.organizationId,
    siteId: record.siteId,
    weekStartsOn: dateToPlainDate(record.weekStartsOn),
    needs: record.needs.map((need) => ({
      date: dateToPlainDate(need.date),
      shiftTemplateId: need.shiftTemplateId,
      positionId: need.positionId,
      requiredCount: need.requiredCount,
    })),
    updatedAt: dateToInstant(record.updatedAt),
  });
}
