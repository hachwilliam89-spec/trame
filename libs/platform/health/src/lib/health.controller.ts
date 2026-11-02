import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  HealthCheck,
  type HealthCheckResult,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { ProblemDetailsException, describeForLog } from '@trame/platform/problem-details';
import { READINESS_INDICATORS, type ReadinessIndicator } from './readiness-indicator';

/**
 * - `GET health/live` : le processus répond (redémarrer le conteneur sinon).
 * - `GET health/ready` : les dépendances répondent (ne pas envoyer de trafic sinon). `503` en problem+json.
 */
@Controller('health')
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
    try {
      return await this.health.check(
        this.indicators.map((indicator) => async () => {
          const result = this.indicatorService.check(indicator.name);
          try {
            await indicator.check();
            return result.up();
          } catch (error) {
            // Type et pile dans les logs, sans le message ; rien de tout cela dans la réponse publique.
            this.logger.warn({
              ...describeForLog(error),
              msg: 'Dépendance indisponible',
              indicator: indicator.name,
            });
            return result.down({ message: 'indisponible' });
          }
        }),
      );
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        const body = error.getResponse() as Partial<HealthCheckResult>;
        throw new ProblemDetailsException({
          status: 503,
          detail: 'Une ou plusieurs dépendances ne répondent pas.',
          checks: body.details ?? {},
        });
      }
      throw error;
    }
  }
}
