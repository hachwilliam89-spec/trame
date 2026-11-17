import {
  Controller,
  Get,
  Headers,
  Inject,
  Logger,
  Param,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ReadScheduleGenerationProgress } from '@trame/api/scheduling/application';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { CLOCK, type Clock } from '@trame/platform/clock';
import type { Response } from 'express';
import { parseProgressCursor, streamDeadline } from './progress-request';
import { serveProgressStream } from './progress-stream';
import { generationIdPipe, scheduleGenerationErrors } from './schedule-generation-errors';

@Controller('schedule-generations')
@RequireRoles('admin', 'manager')
@UseInterceptors(scheduleGenerationErrors)
export class ScheduleGenerationProgressController {
  private readonly logger = new Logger(ScheduleGenerationProgressController.name);

  constructor(
    private readonly progress: ReadScheduleGenerationProgress,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Flux SSE `schedule-generation`, partagé avec le diagnostic (`progress-stream.ts`). */
  @Get(':generationId/events')
  async events(
    @CurrentActor() actor: Actor,
    @Param('generationId', generationIdPipe) generationId: string,
    @Headers('last-event-id') lastEventId: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const expiresAt = streamDeadline(actor, this.clock);
    const after = parseProgressCursor(lastEventId);
    const read = (cursor: string | undefined) =>
      this.progress.execute({ organizationId: actor.organizationId, generationId, after: cursor });
    const initial = await read(after);
    streamDeadline(actor, this.clock);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Correlation-ID', generationId);
    if (initial.finishedAt !== undefined && initial.events.length === 0) {
      response.status(204).end();
      return;
    }
    response.status(200).setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.flushHeaders();
    await serveProgressStream({
      response,
      clock: this.clock,
      expiresAt,
      initial,
      after,
      read,
      eventName: 'schedule-generation',
      isFinal: (event) => event.status !== 'RUNNING',
      onError: (error) =>
        this.logger.warn({
          event: 'schedule_generation_stream_closed',
          generationId,
          errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        }),
    });
  }
}
