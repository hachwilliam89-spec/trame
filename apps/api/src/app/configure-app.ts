import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { z } from 'zod';
import { fr } from 'zod/locales';

/** Préfixe de toutes les routes de l'API (ADR-0021). */
export const API_PREFIX = 'api/v1';

/**
 * Réglages HTTP communs à `main.ts` et aux tests, pour tester l'application telle qu'elle tourne.
 * Pas de helmet : les en-têtes de sécurité sont posés par Traefik (ADR-0024).
 */
export function configureApp(app: INestApplication): void {
  z.config(fr());
  app.setGlobalPrefix(API_PREFIX);
  (app as NestExpressApplication).disable('x-powered-by');
  app.enableShutdownHooks();
}
