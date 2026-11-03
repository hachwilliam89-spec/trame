import type { INestApplication } from '@nestjs/common';
import type { Env } from '../config/env.schema';

/**
 * Ouvre le serveur HTTP sur l'adresse configurée. Sans adresse, Node écouterait sur toutes les
 * interfaces du poste, et l'API serait joignable depuis le réseau local.
 */
export async function listenOnConfiguredAddress(
  app: INestApplication,
  config: Pick<Env, 'HOST' | 'PORT'>,
): Promise<void> {
  await app.listen(config.PORT, config.HOST);
}
