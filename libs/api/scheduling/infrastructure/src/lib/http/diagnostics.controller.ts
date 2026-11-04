import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import {
  DiagnosticNotFoundError,
  GetDiagnostic,
  StartDiagnostic,
} from '@trame/api/scheduling/application';
import type { DiagnosticRun } from '@trame/api/scheduling/domain';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { IdempotencyKey, InvalidIdempotencyKeyError } from '@trame/platform/idempotency';
import { ErrorMappingInterceptor, ProblemDetailsException } from '@trame/platform/problem-details';
import { ZodValidationPipe } from '@trame/platform/zod-validation';
import { type DiagnosticRunV1, startDiagnosticRequestV1 } from '@trame/shared/contracts';
import type { Response } from 'express';

const runIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new ProblemDetailsException({ status: 404, detail: 'Diagnostic introuvable.' }),
});

@Controller('diagnostics/solver-runs')
@RequireRoles('admin', 'manager')
@UseInterceptors(
  new ErrorMappingInterceptor([
    { error: DiagnosticNotFoundError, status: 404 },
    { error: InvalidIdempotencyKeyError, status: 400 },
  ]),
)
export class DiagnosticsController {
  constructor(
    private readonly startDiagnostic: StartDiagnostic,
    private readonly getDiagnostic: GetDiagnostic,
  ) {}

  @Post()
  @HttpCode(202)
  async start(
    @CurrentActor() actor: Actor,
    @Headers('idempotency-key') key: unknown,
    @Body(new ZodValidationPipe(startDiagnosticRequestV1)) _body: Record<string, never>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DiagnosticRunV1> {
    const run = await this.startDiagnostic.execute({
      organizationId: actor.organizationId,
      key: IdempotencyKey.of(key),
    });
    response.setHeader('Location', `/api/v1/diagnostics/solver-runs/${run.id}`);
    return toDiagnosticRunV1(run);
  }

  @Get(':runId')
  async get(
    @CurrentActor() actor: Actor,
    @Param('runId', runIdPipe) runId: string,
  ): Promise<DiagnosticRunV1> {
    const run = await this.getDiagnostic.execute({ organizationId: actor.organizationId, runId });
    return toDiagnosticRunV1(run);
  }
}

function toDiagnosticRunV1(run: DiagnosticRun): DiagnosticRunV1 {
  return {
    id: run.id,
    status: run.status,
    createdAt: run.createdAt.toString(),
    ...(run.outcome === undefined ? {} : { outcome: run.outcome }),
    ...(run.failure === undefined ? {} : { failure: run.failure }),
    ...(run.finishedAt === undefined ? {} : { finishedAt: run.finishedAt.toString() }),
  };
}
