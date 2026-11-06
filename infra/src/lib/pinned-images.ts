import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type DevStackService = 'keycloak' | 'postgres' | 'rabbitmq';

/**
 * L'image figée d'un service de `dev.yml`, avec son digest : les tests d'infrastructure jouent la
 * même version que le poste de développement.
 */
export function devStackImage(service: DevStackService): string {
  const compose = readFileSync(join(__dirname, '../../compose/dev.yml'), 'utf8');
  const servicePattern = new RegExp(`\\n  ${service}:\\n    image: (\\S+@sha256:[0-9a-f]{64})\\n`);
  const match = servicePattern.exec(compose);
  if (match?.[1] === undefined) {
    throw new Error(`Image figée de ${service} introuvable dans dev.yml.`);
  }
  return match[1];
}
