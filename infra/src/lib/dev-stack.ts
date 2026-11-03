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

/** Un port libre sur 127.0.0.1, choisi par le système. */
export async function reserveFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === 'string') {
    throw new Error('Port libre introuvable');
  }
  return address.port;
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
export async function startApi(port: number, databaseUrl: string): Promise<ApiProcess> {
  const environment = await isolatedEnvironment({
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    LOG_LEVEL: 'silent',
    DATABASE_URL: databaseUrl,
    // Les sondes de santé sont publiques : ces tests ne présentent aucun jeton.
    OIDC_ISSUER_URL: 'https://idp.invalid/realms/trame',
    OIDC_AUDIENCE: 'trame-api',
    OIDC_JWKS_URL: 'https://idp.invalid/realms/trame/protocol/openid-connect/certs',
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
