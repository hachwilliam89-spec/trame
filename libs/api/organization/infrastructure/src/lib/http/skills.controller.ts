import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  CreateSkill,
  DeleteSkill,
  GetSkill,
  ListSkills,
} from '@trame/api/organization/application';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { ErrorMappingInterceptor } from '@trame/platform/problem-details';
import { ZodValidationPipe } from '@trame/platform/zod-validation';
import {
  type CreateSkillRequestV1,
  type PageQueryV1,
  type SkillPageV1,
  type SkillV1,
  createSkillRequestV1,
  pageQueryV1,
  roleV1,
} from '@trame/shared/contracts';
import { organizationErrorMappings } from './organization-error-mappings';
import { toPageRequest } from './page-request';
import { toSkillV1 } from './skill-presenter';
import { resourceIdPipe } from './resource-id.pipe';

@Controller('skills')
@UseInterceptors(new ErrorMappingInterceptor(organizationErrorMappings))
export class SkillsController {
  constructor(
    private readonly createSkill: CreateSkill,
    private readonly getSkill: GetSkill,
    private readonly listSkills: ListSkills,
    private readonly deleteSkill: DeleteSkill,
  ) {}

  @Post()
  @RequireRoles(roleV1.enum.admin)
  async create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createSkillRequestV1)) body: CreateSkillRequestV1,
  ): Promise<SkillV1> {
    const skill = await this.createSkill.execute({
      organizationId: actor.organizationId,
      name: body.name,
    });
    return toSkillV1(skill);
  }

  @Get()
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(pageQueryV1)) query: PageQueryV1,
  ): Promise<SkillPageV1> {
    const page = await this.listSkills.execute({
      organizationId: actor.organizationId,
      page: toPageRequest(query),
    });
    return { items: page.items.map(toSkillV1), nextCursor: page.nextCursor };
  }

  @Get(':skillId')
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async get(
    @CurrentActor() actor: Actor,
    @Param('skillId', resourceIdPipe) skillId: string,
  ): Promise<SkillV1> {
    return toSkillV1(
      await this.getSkill.execute({ organizationId: actor.organizationId, skillId }),
    );
  }

  @Delete(':skillId')
  @HttpCode(204)
  @RequireRoles(roleV1.enum.admin)
  async delete(
    @CurrentActor() actor: Actor,
    @Param('skillId', resourceIdPipe) skillId: string,
  ): Promise<void> {
    await this.deleteSkill.execute({ organizationId: actor.organizationId, skillId });
  }
}
