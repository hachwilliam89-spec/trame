import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

/** Les deux stacks des environnements déployés (US-005 B2a, #47). */
export type DeployedStack = 'shared' | 'staging';

export interface ServiceVolume {
  type: string;
  source?: string;
  target: string;
  read_only?: boolean;
}

export interface DeployedService {
  image?: string;
  build?: { context: string; dockerfile: string };
  ports?: unknown[];
  networks?: Record<string, unknown>;
  labels?: Record<string, string>;
  environment?: Record<string, string>;
  read_only?: boolean;
  cap_drop?: string[];
  security_opt?: string[];
  restart?: string;
  mem_limit?: string | number;
  cpus?: string | number;
  logging?: { driver: string; options?: Record<string, string> };
  command?: string[];
  tmpfs?: string[];
  volumes?: ServiceVolume[];
  depends_on?: Record<string, { condition: string; restart?: boolean; required?: boolean }>;
}

export interface DeployedNetwork {
  name: string;
  internal?: boolean;
  external?: boolean;
}

export interface DeployedStackConfig {
  services: Record<string, DeployedService>;
  networks: Record<string, DeployedNetwork>;
}

export const COMPOSE_DIRECTORY = join(__dirname, '../../compose');

/** Les six images applicatives, désignées par les digests que `deploy.sh` lit dans la version. */
export const APPLICATION_SERVICES = ['migrator', 'api', 'relay', 'engine', 'worker', 'web'];

/** Digests fictifs, de la forme de ceux d'une version vérifiée. */
export function exampleImageDigests(): Record<string, string> {
  const digests: Record<string, string> = {};
  for (const [index, service] of APPLICATION_SERVICES.entries()) {
    const variable = `TRAME_${service.toUpperCase()}_DIGEST`;
    digests[variable] = `sha256:${String(index).repeat(64)}`;
  }
  return digests;
}

/** Variables d'une stack avec les modèles de secrets du dépôt, qui n'ont aucune valeur. */
export function exampleVariables(stack: DeployedStack): Record<string, string> {
  const secretsDirectory = join(COMPOSE_DIRECTORY, 'secrets.example', stack);
  if (stack === 'shared') {
    return {
      TRAME_SECRETS_DIR: secretsDirectory,
      KEYCLOAK_ADMIN_URL: 'http://127.0.0.1:18080',
    };
  }
  return { TRAME_SECRETS_DIR: secretsDirectory, ...exampleImageDigests() };
}

/** Configuration d'une stack telle que Docker l'appliquerait, après interpolation. */
export async function resolvedStackConfig(
  stack: DeployedStack,
  variables: Record<string, string> = exampleVariables(stack),
): Promise<DeployedStackConfig> {
  const { stdout } = await promisify(execFile)(
    'docker',
    ['compose', '--file', join(COMPOSE_DIRECTORY, `${stack}.yml`), 'config', '--format', 'json'],
    { env: { ...process.env, ...variables }, timeout: 30_000 },
  );
  return JSON.parse(stdout) as DeployedStackConfig;
}
