import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { connect as connectTcp, createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { type ComposeOptions, compose, isolatedEnvironment } from './compose';

const execFileAsync = promisify(execFile);

const WORKSPACE_ROOT = join(__dirname, '../../..');
const DATABASE_LIBRARY_ROOT = join(WORKSPACE_ROOT, 'libs/api/shared/database');
const PRISMA_BINARY = join(WORKSPACE_ROOT, 'node_modules/.bin/prisma');
const BUILT_API_ENTRY = join(WORKSPACE_ROOT, 'dist/apps/api/main.js');
const BUILT_LOAD_DEMO_ENTRY = join(WORKSPACE_ROOT, 'dist/apps/api/load-demo.js');

const STARTUP_TIMEOUT_SECONDS = '120';

/** Démarre la stack et attend que chaque service soit sain, comme `infra:up`. */
export async function startStack(options: ComposeOptions, services: string[] = []): Promise<void> {
  await compose(
    ['up', '--detach', '--wait', '--wait-timeout', STARTUP_TIMEOUT_SECONDS, ...services],
    options,
  );
}

/** État de santé de chaque service, tel que Docker le rapporte. */
export async function serviceHealth(options: ComposeOptions): Promise<Record<string, string>> {
  const output = await compose(['ps', '--format', 'json'], options);
  const health: Record<string, string> = {};
  // Une ligne JSON par conteneur.
  for (const line of output.trim().split('\n')) {
    const container = JSON.parse(line) as { Service: string; Health: string };
    health[container.Service] = container.Health || 'sans healthcheck';
  }
  return health;
}

/** Lance la CLI Prisma de la lib de base de données. Rejette si elle échoue. */
export async function runPrisma(args: string[], databaseUrl: string): Promise<void> {
  await execFileAsync(PRISMA_BINARY, args, {
    cwd: DATABASE_LIBRARY_ROOT,
    env: await isolatedEnvironment({ DATABASE_URL: databaseUrl }),
  });
}

export async function queryDatabase(databaseUrl: string, sql: string): Promise<unknown[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(sql);
    return result.rows;
  } finally {
    await client.end();
  }
}

/**
 * Plage des ports réservés pour les stacks de test. Elle reste sous la plage éphémère de Linux
 * (32768 à 60999), où le système choisit le port d'un `listen(0)` et où Docker choisit les ports
 * publiés sans numéro, ceux de Testcontainers notamment. Un port pris dans la plage éphémère
 * pouvait être attribué à un autre conteneur entre sa réservation et le démarrage de la stack :
 * `docker compose up` échouait alors sur « port is already allocated ».
 */
export const RESERVED_PORTS = { first: 20_000, last: 32_767 } as const;

const MAX_ATTEMPTS = 50;

/** Ports déjà rendus par ce processus : une même stack ne reçoit jamais deux fois le même. */
const portsHandedOut = new Set<number>();

function randomReservedPort(): number {
  const rangeSize = RESERVED_PORTS.last - RESERVED_PORTS.first + 1;
  return RESERVED_PORTS.first + Math.floor(Math.random() * rangeSize);
}

/** Vrai si l'on peut écouter sur ce port de 127.0.0.1 ; le port est relâché aussitôt. */
async function canListenOn(port: number): Promise<boolean> {
  const server = createServer();
  const listening = await new Promise<boolean>((resolve) => {
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => resolve(true));
  });
  if (listening) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return listening;
}

/**
 * Un port libre sur 127.0.0.1, dans `RESERVED_PORTS`. `nextCandidate` ne sert qu'aux tests,
 * pour imposer les ports essayés.
 */
export async function reserveFreePort(
  nextCandidate: () => number = randomReservedPort,
): Promise<number> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const port = nextCandidate();
    if (!portsHandedOut.has(port) && (await canListenOn(port))) {
      portsHandedOut.add(port);
      return port;
    }
  }
  throw new Error(
    `Aucun port libre entre ${RESERVED_PORTS.first} et ${RESERVED_PORTS.last} ` +
      `après ${MAX_ATTEMPTS} essais`,
  );
}

/** Vrai si une connexion TCP s'ouvre : quelqu'un écoute à cette adresse et ce port. */
export async function acceptsConnection(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connectTcp({ host, port, timeout: 2_000 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

/** Adresse IPv4 du poste sur le réseau, s'il en a une. */
export function externalIpv4Address(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    const external = addresses?.find((address) => address.family === 'IPv4' && !address.internal);
    if (external) {
      return external.address;
    }
  }
  return undefined;
}

export interface ApiProcess {
  baseUrl: string;
  stop(): Promise<void>;
}

/** Démarre l'API construite (`api:build`) sur 127.0.0.1, et attend qu'elle réponde. */
export async function startApi(
  port: number,
  databaseUrl: string,
  issuerUrl = 'https://idp.invalid/realms/trame',
): Promise<ApiProcess> {
  const environment = await isolatedEnvironment({
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    LOG_LEVEL: 'silent',
    DATABASE_URL: databaseUrl,
    // Les sondes de santé sont publiques : ces tests ne présentent aucun jeton.
    OIDC_ISSUER_URL: issuerUrl,
    OIDC_AUDIENCE: 'trame-api',
    OIDC_JWKS_URL: issuerUrl + '/protocol/openid-connect/certs',
  });
  const child = spawn(process.execPath, [BUILT_API_ENTRY], { env: environment, stdio: 'ignore' });
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  await waitUntilResponding(`${baseUrl}/health/live`);
  return { baseUrl, stop: () => stopProcess(child) };
}

async function waitUntilResponding(url: string): Promise<void> {
  const deadline = performance.now() + 30_000;
  while (performance.now() < deadline) {
    if (await responds(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Aucune réponse de ${url} après 30 s`);
}

async function responds(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await exited;
}

/** Le site et le lundi rendus par la commande opérateur du jeu de démonstration. */
export interface LoadedDemo {
  siteId: string;
  weekStartsOn: string;
}

/** Charge le jeu de démonstration avec la commande construite, comme au staging. */
export async function loadDemo(databaseUrl: string, organizationId: string): Promise<LoadedDemo> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [BUILT_LOAD_DEMO_ENTRY, '--organization', organizationId],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, timeout: 60_000 },
  );
  return JSON.parse(stdout) as LoadedDemo;
}
