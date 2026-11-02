import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { CreatePosition, GetPosition, ListPositions } from '@trame/api/organization/application';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { ErrorMappingInterceptor } from '@trame/platform/problem-details';
import { ZodValidationPipe } from '@trame/platform/zod-validation';
import {
  type CreatePositionRequestV1,
  type PageQueryV1,
  type PositionPageV1,
  type PositionV1,
  createPositionRequestV1,
  pageQueryV1,
  roleV1,
} from '@trame/shared/contracts';
import { organizationErrorMappings } from './organization-error-mappings';
import { toPageRequest } from './page-request';
import { toPositionV1 } from './position-presenter';
import { resourceIdPipe } from './resource-id.pipe';

@Controller('sites/:siteId/positions')
@UseInterceptors(new ErrorMappingInterceptor(organizationErrorMappings))
export class PositionsController {
  constructor(
    private readonly createPosition: CreatePosition,
    private readonly getPosition: GetPosition,
    private readonly listPositions: ListPositions,
  ) {}

  @Post()
  @RequireRoles(roleV1.enum.admin)
  async create(
    @CurrentActor() actor: Actor,
    @Param('siteId', resourceIdPipe) siteId: string,
    @Body(new ZodValidationPipe(createPositionRequestV1)) body: CreatePositionRequestV1,
  ): Promise<PositionV1> {
    const position = await this.createPosition.execute({
      organizationId: actor.organizationId,
      siteId,
      name: body.name,
      skillIds: body.skillIds,
    });
    return toPositionV1(position);
  }

  @Get()
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async list(
    @CurrentActor() actor: Actor,
    @Param('siteId', resourceIdPipe) siteId: string,
    @Query(new ZodValidationPipe(pageQueryV1)) query: PageQueryV1,
  ): Promise<PositionPageV1> {
    const page = await this.listPositions.execute({
      organizationId: actor.organizationId,
      siteId,
      page: toPageRequest(query),
    });
    return { items: page.items.map(toPositionV1), nextCursor: page.nextCursor };
  }

  @Get(':positionId')
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async get(
    @CurrentActor() actor: Actor,
    @Param('siteId', resourceIdPipe) siteId: string,
    @Param('positionId', resourceIdPipe) positionId: string,
  ): Promise<PositionV1> {
    return toPositionV1(
      await this.getPosition.execute({ organizationId: actor.organizationId, siteId, positionId }),
    );
  }
}
