import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  PROBLEM_JSON,
  type ProblemDetails,
  ProblemDetailsException,
  problem,
} from './problem-details';

/**
 * Rend toute erreur HTTP au format RFC 9457 (`application/problem+json`).
 * - `ProblemDetailsException` : le problème est rendu tel quel.
 * - `HttpException` de NestJS : statut conservé, message repris en `detail`.
 * - Toute autre erreur : 500 générique, sans fuite d'information ; l'erreur est journalisée.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const body: ProblemDetails = {
      ...this.toProblem(exception),
      instance: request.originalUrl.split('?')[0],
    };

    if (body.status >= 500) {
      this.logger.error(exception instanceof Error ? exception : String(exception));
    }

    response.status(body.status).type(PROBLEM_JSON).json(body);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof ProblemDetailsException) {
      return exception.problem;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const detail = this.detailOf(exception.getResponse());
      return problem(detail === undefined ? { status } : { status, detail });
    }
    return problem({ status: 500 });
  }

  private detailOf(response: string | object): string | undefined {
    if (typeof response === 'string') {
      return response;
    }
    const message: unknown = (response as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && message.every((m) => typeof m === 'string')) {
      return message.join(' ; ');
    }
    return undefined;
  }
}
