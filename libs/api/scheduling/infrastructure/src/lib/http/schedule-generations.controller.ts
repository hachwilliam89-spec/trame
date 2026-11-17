import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import {
  GetScheduleGeneration,
  GetWeekScheduleGenerations,
  StartScheduleGeneration,
} from '@trame/api/scheduling/application';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { IdempotencyKey } from '@trame/platform/idempotency';
import { ZodValidationPipe } from '@trame/platform/zod-validation';
import {
  type ScheduleGenerationV1,
  type StartScheduleGenerationRequestV1,
  type WeekScheduleGenerationsQueryV1,
  type WeekScheduleGenerationsV1,
  startScheduleGenerationRequestV1,
  weekScheduleGenerationsQueryV1,
} from '@trame/shared/contracts';
import type { Response } from 'express';
import { generationIdPipe, scheduleGenerationErrors } from './schedule-generation-errors';
import {
  toScheduleGenerationV1,
  toWeekScheduleGenerationsV1,
} from './schedule-generation-presenter';

const collection = '/api/v1/schedule-generations';

@Controller('schedule-generations')
@RequireRoles('admin', 'manager')
@UseInterceptors(scheduleGenerationErrors)
export class ScheduleGenerationsController {
  private readonly logger = new Logger(ScheduleGenerationsController.name);

  constructor(
    private readonly startGeneration: StartScheduleGeneration,
    private readonly getGeneration: GetScheduleGeneration,
    private readonly getWeek: GetWeekScheduleGenerations,
  ) {}

  /** Le calcul se fait dans le moteur : la réponse revient aussitôt, en attente (202). */
  @Post()
  @HttpCode(202)
  async start(
    @CurrentActor() actor: Actor,
    @Headers('idempotency-key') key: unknown,
    @Body(new ZodValidationPipe(startScheduleGenerationRequestV1))
    body: StartScheduleGenerationRequestV1,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ScheduleGenerationV1> {
    const generation = await this.startGeneration.execute({
      organizationId: actor.organizationId,
      siteId: body.siteId,
      weekStartsOn: Temporal.PlainDate.from(body.weekStartsOn),
      key: IdempotencyKey.of(key),
    });
    this.logger.log({ event: 'schedule_generation_requested', generationId: generation.id });
    response.setHeader('X-Correlation-ID', generation.id);
    response.setHeader('Location', `${collection}/${generation.id}`);
    return toScheduleGenerationV1(generation);
  }

  /** Les générations d'une semaine, retrouvées après un rechargement de la page. */
  @Get()
  async week(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(weekScheduleGenerationsQueryV1))
    query: WeekScheduleGenerationsQueryV1,
  ): Promise<WeekScheduleGenerationsV1> {
    const week = await this.getWeek.execute({
      organizationId: actor.organizationId,
      siteId: query.siteId,
      weekStartsOn: Temporal.PlainDate.from(query.weekStartsOn),
    });
    return toWeekScheduleGenerationsV1(week);
  }

  @Get(':generationId')
  async get(
    @CurrentActor() actor: Actor,
    @Param('generationId', generationIdPipe) generationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ScheduleGenerationV1> {
    const generation = await this.getGeneration.execute({
      organizationId: actor.organizationId,
      generationId,
    });
    response.setHeader('X-Correlation-ID', generation.id);
    return toScheduleGenerationV1(generation);
  }
}
