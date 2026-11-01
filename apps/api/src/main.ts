import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';
import { API_PREFIX, configureApp } from './app/configure-app';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  configureApp(app);

  const port = app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true });
  await app.listen(port);
  logger.log(`API prête sur http://localhost:${port}/${API_PREFIX}`);

  // Signal attendu par `nx serve` (cible continue) pour savoir que le serveur écoute.
  if (process.env['NX_READY_SIGNAL_SOCKET']) {
    const { emitReadySignal } = (await import('@nx/js/ready-signal')) as {
      emitReadySignal(server: unknown): boolean;
    };
    emitReadySignal(app.getHttpServer());
  }
}

void bootstrap();
