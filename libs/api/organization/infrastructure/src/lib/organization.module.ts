import { Module } from '@nestjs/common';
import { catalogProviders } from './catalog.providers';
import { SkillsController } from './http/skills.controller';
import { PositionsController } from './http/positions.controller';
import {
  CreateShiftTemplate,
  CreateSite,
  GetShiftTemplateDurations,
  GetSite,
  ListShiftTemplates,
  ListSites,
  type ShiftTemplateRepository,
  type SiteRepository,
} from '@trame/api/organization/application';
import { CLOCK, type Clock } from '@trame/platform/clock';
import { ID_GENERATOR, type IdGenerator } from '@trame/platform/ids';
import { ShiftTemplatesController } from './http/shift-templates.controller';
import { SitesController } from './http/sites.controller';
import { PrismaShiftTemplateRepository } from './persistence/prisma-shift-template.repository';
import { PrismaSiteRepository } from './persistence/prisma-site.repository';
import { SHIFT_TEMPLATE_REPOSITORY, SITE_REPOSITORY } from './repository-tokens';

/**
 * Contexte `organization` : sites et créneaux types (US-030, module de référence).
 * Les use cases sont des classes sans framework : ce module les assemble avec leurs dépendances.
 * Requiert `DatabaseModule`, `ClockModule`, `IdsModule` et `AuthModule` dans l'application.
 */
@Module({
  controllers: [SitesController, ShiftTemplatesController, SkillsController, PositionsController],
  providers: [
    ...catalogProviders,
    { provide: SITE_REPOSITORY, useClass: PrismaSiteRepository },
    { provide: SHIFT_TEMPLATE_REPOSITORY, useClass: PrismaShiftTemplateRepository },
    {
      provide: CreateSite,
      inject: [SITE_REPOSITORY, CLOCK, ID_GENERATOR],
      useFactory: (sites: SiteRepository, clock: Clock, ids: IdGenerator) =>
        new CreateSite(sites, clock, ids),
    },
    {
      provide: GetSite,
      inject: [SITE_REPOSITORY],
      useFactory: (sites: SiteRepository) => new GetSite(sites),
    },
    {
      provide: ListSites,
      inject: [SITE_REPOSITORY],
      useFactory: (sites: SiteRepository) => new ListSites(sites),
    },
    {
      provide: CreateShiftTemplate,
      inject: [SITE_REPOSITORY, SHIFT_TEMPLATE_REPOSITORY, CLOCK, ID_GENERATOR],
      useFactory: (
        sites: SiteRepository,
        shiftTemplates: ShiftTemplateRepository,
        clock: Clock,
        ids: IdGenerator,
      ) => new CreateShiftTemplate(sites, shiftTemplates, clock, ids),
    },
    {
      provide: ListShiftTemplates,
      inject: [SITE_REPOSITORY, SHIFT_TEMPLATE_REPOSITORY],
      useFactory: (sites: SiteRepository, shiftTemplates: ShiftTemplateRepository) =>
        new ListShiftTemplates(sites, shiftTemplates),
    },
    {
      provide: GetShiftTemplateDurations,
      inject: [SITE_REPOSITORY, SHIFT_TEMPLATE_REPOSITORY],
      useFactory: (sites: SiteRepository, shiftTemplates: ShiftTemplateRepository) =>
        new GetShiftTemplateDurations(sites, shiftTemplates),
    },
  ],
})
export class OrganizationModule {}
