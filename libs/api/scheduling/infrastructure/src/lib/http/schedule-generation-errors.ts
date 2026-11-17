import {
  IdempotencyKeyReusedError,
  InvalidProgressCursorError,
  ScheduleGenerationNotFoundError,
  ScheduleRequestTooLargeError,
  SiteNotFoundError,
} from '@trame/api/scheduling/application';
import { NoCoverageNeedError, WeekMustStartOnMondayError } from '@trame/api/scheduling/domain';
import { InvalidIdempotencyKeyError } from '@trame/platform/idempotency';
import { ErrorMappingInterceptor, ProblemDetailsException } from '@trame/platform/problem-details';
import { ParseUUIDPipe } from '@nestjs/common';

/** Erreurs métier des routes de génération, en RFC 9457. */
export const scheduleGenerationErrors = new ErrorMappingInterceptor([
  { error: InvalidIdempotencyKeyError, status: 400 },
  { error: WeekMustStartOnMondayError, status: 400 },
  { error: InvalidProgressCursorError, status: 400 },
  { error: SiteNotFoundError, status: 404 },
  { error: ScheduleGenerationNotFoundError, status: 404 },
  { error: IdempotencyKeyReusedError, status: 409 },
  { error: NoCoverageNeedError, status: 422 },
  { error: ScheduleRequestTooLargeError, status: 422 },
]);

/** Un identifiant mal formé désigne une génération introuvable, comme pour le diagnostic. */
export const generationIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new ProblemDetailsException({ status: 404, detail: 'Génération introuvable.' }),
});
