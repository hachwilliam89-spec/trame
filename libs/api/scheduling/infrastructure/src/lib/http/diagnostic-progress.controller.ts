import {
  Controller,
  Get,
  Headers,
  Inject,
  Logger,
  Param,
  ParseUUIDPipe,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import {
  DiagnosticNotFoundError,
  InvalidProgressCursorError,
  ProgressExpiredError,
  ReadDiagnosticProgress,
} from '@trame/api/scheduling/application';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { CLOCK, type Clock } from '@trame/platform/clock';
import { ErrorMappingInterceptor, ProblemDetailsException } from '@trame/platform/problem-details';
import type { Response } from 'express';
import { z } from 'zod';
import { serveDiagnosticStream } from './diagnostic-stream';

const runIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new ProblemDetailsException({ status: 404, detail: 'Diagnostic introuvable.' }),
});

@Controller('diagnostics/solver-runs')
@RequireRoles('admin', 'manager')
@UseInterceptors(
  new ErrorMappingInterceptor([
    { error: DiagnosticNotFoundError, status: 404 },
    { error: InvalidProgressCursorError, status: 400 },
    { error: ProgressExpiredError, status: 410 },
  ]),
)
export class DiagnosticProgressController {
  private readonly logger = new Logger(DiagnosticProgressController.name);
  constructor(
    private readonly progress: ReadDiagnosticProgress,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get(':runId/events')
  async events(
    @CurrentActor() actor: Actor,
    @Param('runId', runIdPipe) runId: string,
    @Headers('last-event-id') lastEventId: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const expiresAt = this.expiration(actor);
    const after = parseCursor(lastEventId);
    const read = (cursor: string | undefined) =>
      this.progress.execute({ organizationId: actor.organizationId, runId, after: cursor });
    const initial = await read(after);
    this.expiration(actor);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Correlation-ID', runId);
    if (initial.finishedAt !== undefined && initial.events.length === 0) {
      response.status(204).end();
      return;
    }
    response.status(200).setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.flushHeaders();
    await serveDiagnosticStream({
      response,
      clock: this.clock,
      expiresAt,
      initial,
      after,
      read,
      onError: (error) =>
        this.logger.warn({
          event: 'diagnostic_stream_closed',
          runId,
          errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        }),
    });
  }

  private expiration(actor: Actor): number {
    const deadline = actor.expiresAtEpochMilliseconds;
    if (
      deadline === undefined ||
      !Number.isSafeInteger(deadline) ||
      deadline <= this.clock.now().epochMilliseconds
    ) {
      throw new ProblemDetailsException(
        { status: 401, detail: 'Authentification requise.' },
        { headers: { 'WWW-Authenticate': 'Bearer' } },
      );
    }
    return deadline;
  }
}

function parseCursor(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new InvalidProgressCursorError();
  return parsed.data;
}
