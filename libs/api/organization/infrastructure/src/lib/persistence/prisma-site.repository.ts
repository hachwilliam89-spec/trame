import { Injectable } from '@nestjs/common';
import type { SiteRepository } from '@trame/api/organization/application';
import { Site, SiteCode, SiteCodeAlreadyUsedError, TimeZone } from '@trame/api/organization/domain';
import {
  type Prisma,
  PrismaService,
  dateToInstant,
  instantToDate,
  isUniqueViolation,
} from '@trame/api/database';
import { type Page, type PageRequest, pageFrom } from '@trame/platform/pagination';
import { afterCursor } from './after-cursor';

/** Sites dans la table `organization.sites`. */
@Injectable()
export class PrismaSiteRepository implements SiteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async add(site: Site): Promise<void> {
    try {
      await this.prisma.site.create({ data: toRecord(site) });
    } catch (error) {
      // Deux créations simultanées : la contrainte d'unicité tranche.
      if (isUniqueViolation(error)) {
        throw new SiteCodeAlreadyUsedError(site.code.value);
      }
      throw error;
    }
  }

  async existsWithCode(organizationId: string, code: SiteCode): Promise<boolean> {
    const count = await this.prisma.site.count({ where: { organizationId, code: code.value } });
    return count > 0;
  }

  async findById(organizationId: string, siteId: string): Promise<Site | undefined> {
    const record = await this.prisma.site.findFirst({ where: { id: siteId, organizationId } });
    if (record === null) {
      return undefined;
    }
    return toSite(record);
  }

  async list(organizationId: string, page: PageRequest): Promise<Page<Site>> {
    const records = await this.prisma.site.findMany({
      where: { organizationId, id: afterCursor(page.after) },
      orderBy: { id: 'asc' },
      take: page.limit + 1,
    });
    return pageFrom(records.map(toSite), page.limit);
  }
}

function toRecord(site: Site): Prisma.SiteModel {
  return {
    id: site.id,
    organizationId: site.organizationId,
    code: site.code.value,
    name: site.name,
    timeZone: site.timeZone.id,
    createdAt: instantToDate(site.createdAt),
  };
}

function toSite(record: Prisma.SiteModel): Site {
  return Site.create({
    id: record.id,
    organizationId: record.organizationId,
    code: SiteCode.of(record.code),
    name: record.name,
    timeZone: TimeZone.of(record.timeZone),
    createdAt: dateToInstant(record.createdAt),
  });
}
