import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv, promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const COMPOSE_FILE_PATH = join(__dirname, '../../compose/dev.yml');

/** Les tests partent toujours de `.env.example`, jamais du `.env` du développeur. */
export const ENV_EXAMPLE_PATH = join(__dirname, '../../../.env.example');

export interface ComposeOptions {
  /** Nom du projet Compose : isole conteneurs et volumes d'une autre stack. */
  projectName?: string;
  /** Variables qui remplacent celles de `.env.example`, par exemple les ports. */
  overrides?: Record<string, string>;
}

export interface PublishedPort {
  host_ip?: string;
  published: string;
  target: number;
}

export interface ServiceVolume {
  type: string;
  source?: string;
  target: string;
}

export interface ComposeService {
  image: string;
  environment?: Record<string, string>;
  ports?: PublishedPort[];
  healthcheck?: { test?: string[] };
  volumes?: ServiceVolume[];
}

export interface ResolvedComposeConfig {
  services: Record<string, ComposeService>;
}

/** Lance `docker compose` sur le fichier de dev et renvoie sa sortie standard. */
export async function compose(args: string[], options: ComposeOptions = {}): Promise<string> {
  const projectArgs = options.projectName ? ['--project-name', options.projectName] : [];
  const { stdout } = await execFileAsync(
    'docker',
    [
      'compose',
      ...projectArgs,
      '--env-file',
      ENV_EXAMPLE_PATH,
      '--file',
      COMPOSE_FILE_PATH,
      ...args,
    ],
    // Les variables du processus priment sur le fichier d'environnement (règle de Compose).
    { env: { ...process.env, ...options.overrides }, maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout;
}

/** Configuration telle que Docker l'appliquera, après interpolation des variables. */
export async function resolvedComposeConfig(
  options: ComposeOptions = {},
): Promise<ResolvedComposeConfig> {
  const output = await compose(['config', '--format', 'json'], options);
  return JSON.parse(output) as ResolvedComposeConfig;
}

export async function readEnvExample(): Promise<Record<string, string | undefined>> {
  return parseEnv(await readFile(ENV_EXAMPLE_PATH, 'utf8'));
}
