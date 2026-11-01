import {
  type DynamicModule,
  type InjectionToken,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { type LoggingOptions, createPinoHttpOptions } from './pino-http-options';

export interface LoggingModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: InjectionToken[];
  useFactory(...args: unknown[]): LoggingOptions | Promise<LoggingOptions>;
}

/**
 * Logs JSON structurés via `nestjs-pino`, une ligne par requête HTTP.
 * Dans `main.ts` : `NestFactory.create(AppModule, { bufferLogs: true })` puis `app.useLogger(app.get(Logger))`.
 */
@Module({})
export class LoggingModule {
  static forRoot(options: LoggingOptions): DynamicModule {
    return {
      module: LoggingModule,
      imports: [LoggerModule.forRoot({ pinoHttp: createPinoHttpOptions(options) })],
      exports: [LoggerModule],
    };
  }

  static forRootAsync(options: LoggingModuleAsyncOptions): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRootAsync({
          imports: options.imports ?? [],
          inject: options.inject ?? [],
          useFactory: async (...args: unknown[]) => ({
            pinoHttp: createPinoHttpOptions(await options.useFactory(...args)),
          }),
        }),
      ],
      exports: [LoggerModule],
    };
  }
}
