import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule, DatabaseReadiness } from '@trame/api/database';
import { OrganizationModule } from '@trame/api/organization/infrastructure';
import { AuthModule } from '@trame/platform/auth';
import { ClockModule } from '@trame/platform/clock';
import { ConfigModule } from '@trame/platform/config';
import { HealthModule } from '@trame/platform/health';
import { IdsModule } from '@trame/platform/ids';
import { LoggingModule } from '@trame/platform/logging';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import { type Env, envSchema } from '../config/env.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ schema: envSchema }),
    LoggingModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        level: config.get('LOG_LEVEL', { infer: true }),
        pretty: config.get('NODE_ENV', { infer: true }) === 'development',
        quietPaths: ['/api/v1/health'],
      }),
    }),
    ProblemDetailsModule,
    ClockModule,
    DatabaseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        url: config.get('DATABASE_URL', { infer: true }),
      }),
    }),
    HealthModule.forRoot({ indicators: [DatabaseReadiness] }),
    // Sans résolveur, aucun utilisateur n'est reconnu : toute route non publique répond 401
    // jusqu'au branchement d'OIDC (US-020).
    AuthModule.forRoot(),
    IdsModule,
    // Contextes métier.
    OrganizationModule,
  ],
})
export class AppModule {}
