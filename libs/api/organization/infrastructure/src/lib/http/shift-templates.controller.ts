import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import {
  CreateShiftTemplate,
  GetShiftTemplateDurations,
  ListShiftTemplates,
} from '@trame/api/organization/application';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { ErrorMappingInterceptor } from '@trame/platform/problem-details';
import { ZodValidationPipe } from '@trame/platform/zod-validation';
import {
  type CreateShiftTemplateRequestV1,
  type PageQueryV1,
  type ShiftDurationsQueryV1,
  type ShiftDurationsV1,
  type ShiftTemplatePageV1,
  type ShiftTemplateV1,
  createShiftTemplateRequestV1,
  pageQueryV1,
  roleV1,
  shiftDurationsQueryV1,
} from '@trame/shared/contracts';
import { organizationErrorMappings } from './organization-error-mappings';
import { toPageRequest } from './page-request';
import { toShiftDurationsV1, toShiftTemplateV1 } from './presenters';
import { resourceIdPipe } from './resource-id.pipe';

/** Créneaux types d'un site de l'organisation de l'utilisateur. */
@Controller('sites/:siteId/shift-templates')
@UseInterceptors(new ErrorMappingInterceptor(organizationErrorMappings))
export class ShiftTemplatesController {
  constructor(
    private readonly createShiftTemplate: CreateShiftTemplate,
    private readonly listShiftTemplates: ListShiftTemplates,
    private readonly getShiftTemplateDurations: GetShiftTemplateDurations,
  ) {}

  @Post()
  @RequireRoles(roleV1.enum.admin)
  async create(
    @CurrentActor() actor: Actor,
    @Param('siteId', resourceIdPipe) siteId: string,
    @Body(new ZodValidationPipe(createShiftTemplateRequestV1)) body: CreateShiftTemplateRequestV1,
  ): Promise<ShiftTemplateV1> {
    const shiftTemplate = await this.createShiftTemplate.execute({
      organizationId: actor.organizationId,
      siteId,
      label: body.label,
      // Le contrat garantit le format `HH:MM` : la conversion ne peut pas échouer.
      start: Temporal.PlainTime.from(body.startTime),
      end: Temporal.PlainTime.from(body.endTime),
      break: {
        start: Temporal.PlainTime.from(body.break.startTime),
        durationMinutes: body.break.durationMinutes,
      },
    });
    return toShiftTemplateV1(shiftTemplate);
  }

  @Get()
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async list(
    @CurrentActor() actor: Actor,
    @Param('siteId', resourceIdPipe) siteId: string,
    @Query(new ZodValidationPipe(pageQueryV1)) query: PageQueryV1,
  ): Promise<ShiftTemplatePageV1> {
    const page = await this.listShiftTemplates.execute({
      organizationId: actor.organizationId,
      siteId,
      page: toPageRequest(query),
    });
    return { items: page.items.map(toShiftTemplateV1), nextCursor: page.nextCursor };
  }

  @Get(':shiftTemplateId/durations')
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async durations(
    @CurrentActor() actor: Actor,
    @Param('siteId', resourceIdPipe) siteId: string,
    @Param('shiftTemplateId', resourceIdPipe) shiftTemplateId: string,
    @Query(new ZodValidationPipe(shiftDurationsQueryV1)) query: ShiftDurationsQueryV1,
  ): Promise<ShiftDurationsV1> {
    const date = Temporal.PlainDate.from(query.date);
    const durations = await this.getShiftTemplateDurations.execute({
      organizationId: actor.organizationId,
      siteId,
      shiftTemplateId,
      date,
    });
    return toShiftDurationsV1(date, durations);
  }
}
