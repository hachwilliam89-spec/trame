import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import type { z } from 'zod';
import { validateEnv } from './validate-env';

export interface ConfigModuleOptions<TSchema extends z.ZodType> {
  /** Schéma zod de l'environnement. */
  schema: TSchema;
  /** Fichiers `.env` à lire, du plus prioritaire au moins prioritaire. Aucun par défaut. */
  envFilePath?: string[];
}

/**
 * Configuration validée au démarrage (`@nestjs/config` + zod). Globale : `ConfigService` est injectable partout.
 * Lecture typée : `ConfigService<Env, true>` puis `config.get('PORT', { infer: true })`.
 */
@Module({})
export class ConfigModule {
  static forRoot<TSchema extends z.ZodType>(options: ConfigModuleOptions<TSchema>): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      imports: [
        NestConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          ignoreEnvFile: options.envFilePath === undefined,
          envFilePath: options.envFilePath ?? [],
          validate: (env) => validateEnv(options.schema, env) as Record<string, unknown>,
        }),
      ],
      exports: [NestConfigModule],
    };
  }
}
