import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  HealthCheck,
  type HealthCheckResult,
  HealthCheckService,
  type HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { Public } from '@trame/platform/auth';
import { ProblemDetailsException, describeForLog } from '@trame/platform/problem-details';
import { READINESS_INDICATORS, type ReadinessIndicator } from './readiness-indicator';

/**
 * - `GET health/live` : le processus répond (redémarrer le conteneur sinon).
 * - `GET health/ready` : les dépendances répondent (ne pas envoyer de trafic sinon). `503` en problem+json.
 */
@Controller('health')
@Public()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly health: HealthCheckService,
    private readonly indicatorService: HealthIndicatorService,
    @Inject(READINESS_INDICATORS) private readonly indicators: ReadinessIndicator[],
  ) {}

  @Get('live')
  @HealthCheck()
  live(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  async ready(): Promise<HealthCheckResult> {
    const checks = this.indicators.map((indicator) => () => this.check(indicator));
    try {
      return await this.health.check(checks);
    } catch (error) {
      throw this.toProblem(error);
    }
  }

  /** Vérifie une dépendance. Son échec est journalisé sans message, et jamais exposé. */
  private async check(indicator: ReadinessIndicator): Promise<HealthIndicatorResult> {
    const result = this.indicatorService.check(indicator.name);
    try {
      await indicator.check();
      return result.up();
    } catch (error) {
      this.logger.warn({
        ...describeForLog(error),
        msg: 'Dépendance indisponible',
        indicator: indicator.name,
      });
      return result.down({ message: 'indisponible' });
    }
  }

  /** Terminus signale une dépendance en panne par une 503 : on la rend en problem+json. */
  private toProblem(error: unknown): unknown {
    if (!(error instanceof ServiceUnavailableException)) {
      return error;
    }
    const body = error.getResponse() as Partial<HealthCheckResult>;
    return new ProblemDetailsException({
      status: 503,
      detail: 'Une ou plusieurs dépendances ne répondent pas.',
      checks: body.details ?? {},
    });
  }
}
