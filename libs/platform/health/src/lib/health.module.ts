import { type DynamicModule, Module, type ModuleMetadata, type Type } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { READINESS_INDICATORS, type ReadinessIndicator } from './readiness-indicator';

export interface HealthModuleOptions {
  /** Modules qui fournissent les dépendances des indicateurs. */
  imports?: ModuleMetadata['imports'];
  /** Indicateurs vérifiés par `health/ready`. */
  indicators?: Type<ReadinessIndicator>[];
}

/** Endpoints `health/live` et `health/ready` (`@nestjs/terminus`). */
@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions = {}): DynamicModule {
    const indicators = options.indicators ?? [];
    return {
      module: HealthModule,
      imports: [TerminusModule.forRoot({ logger: false }), ...(options.imports ?? [])],
      controllers: [HealthController],
      providers: [
        ...indicators,
        {
          provide: READINESS_INDICATORS,
          useFactory: (...instances: ReadinessIndicator[]) => instances,
          inject: indicators,
        },
      ],
    };
  }
}
