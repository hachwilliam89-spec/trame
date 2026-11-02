import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { CreateSite, GetSite, ListSites } from '@trame/api/organization/application';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { ErrorMappingInterceptor } from '@trame/platform/problem-details';
import { ZodValidationPipe } from '@trame/platform/zod-validation';
import {
  type CreateSiteRequestV1,
  type PageQueryV1,
  type SitePageV1,
  type SiteV1,
  createSiteRequestV1,
  pageQueryV1,
  roleV1,
} from '@trame/shared/contracts';
import { organizationErrorMappings } from './organization-error-mappings';
import { toPageRequest } from './page-request';
import { toSiteV1 } from './presenters';
import { resourceIdPipe } from './resource-id.pipe';

/**
 * Sites de l'organisation de l'utilisateur. L'organisation vient toujours de l'utilisateur
 * authentifié, jamais de la requête.
 */
@Controller('sites')
@UseInterceptors(new ErrorMappingInterceptor(organizationErrorMappings))
export class SitesController {
  constructor(
    private readonly createSite: CreateSite,
    private readonly getSite: GetSite,
    private readonly listSites: ListSites,
  ) {}

  @Post()
  @RequireRoles(roleV1.enum.admin)
  async create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createSiteRequestV1)) body: CreateSiteRequestV1,
  ): Promise<SiteV1> {
    const site = await this.createSite.execute({
      organizationId: actor.organizationId,
      code: body.code,
      name: body.name,
      timeZone: body.timeZone,
    });
    return toSiteV1(site);
  }

  @Get()
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(pageQueryV1)) query: PageQueryV1,
  ): Promise<SitePageV1> {
    const page = await this.listSites.execute({
      organizationId: actor.organizationId,
      page: toPageRequest(query),
    });
    return { items: page.items.map(toSiteV1), nextCursor: page.nextCursor };
  }

  @Get(':siteId')
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async get(
    @CurrentActor() actor: Actor,
    @Param('siteId', resourceIdPipe) siteId: string,
  ): Promise<SiteV1> {
    const site = await this.getSite.execute({ organizationId: actor.organizationId, siteId });
    return toSiteV1(site);
  }
}
