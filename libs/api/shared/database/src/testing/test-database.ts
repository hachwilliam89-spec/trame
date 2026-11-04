import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { reserveTcpPort } from '@trame/platform/messaging/testing';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';

const MIGRATIONS_DIRECTORY = join(__dirname, '../../prisma/migrations');

/** Base PostgreSQL de test, vide et migrée, propre à un fichier de test. */
export interface TestDatabase {
  url: string;
  setServerAvailable(available: boolean): Promise<void>;
  /** Supprime la base, et arrête le conteneur s'il a été démarré pour elle. */
  stop(): Promise<void>;
}

/**
 * Démarre un vrai PostgreSQL (Testcontainers, Docker requis) et y crée une base dédiée, avec
 * toutes les migrations appliquées. `TEST_DATABASE_URL` vise un serveur déjà démarré, quand Docker
 * n'est pas disponible : chaque appel y crée sa propre base, pour que les tests restent isolés.
 */
export async function startTestDatabase(
  options: { faultInjection?: boolean } = {},
): Promise<TestDatabase> {
  const externalServerUrl = options.faultInjection ? undefined : process.env['TEST_DATABASE_URL'];
  let container: StartedPostgreSqlContainer | undefined;
  let serverUrl: string;

  if (externalServerUrl === undefined) {
    const definition = new PostgreSqlContainer('postgres:18-alpine');
    if (options.faultInjection) {
      definition.withExposedPorts({ container: 5432, host: await reserveTcpPort() });
    }
    container = await definition.start();
    serverUrl = container.getConnectionUri();
  } else {
    serverUrl = externalServerUrl;
  }

  const databaseName = `trame_test_${randomUUID().replaceAll('-', '')}`;
  await runOn(serverUrl, `CREATE DATABASE "${databaseName}"`);
  const url = withDatabase(serverUrl, databaseName);
  await applyMigrations(url);

  return {
    url,
    async setServerAvailable(available) {
      if (container === undefined || !options.faultInjection) {
        throw new Error('Injection de panne non activée pour cette base.');
      }
      if (available) {
        await container.restart();
      } else {
        await promisify(execFile)('docker', ['stop', '--time', '0', container.getId()], {
          timeout: 10_000,
        });
      }
    },
    async stop() {
      await runOn(serverUrl, `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await container?.stop();
    },
  };
}

/**
 * Applique les migrations Prisma dans l'ordre, comme `prisma migrate deploy`, sans dépendre du
 * moteur de schéma de Prisma. La CI vérifie à part que `migrate deploy` les applique aussi.
 */
async function applyMigrations(url: string): Promise<void> {
  const entries = await readdir(MIGRATIONS_DIRECTORY, { withFileTypes: true });
  const migrationNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const migrationName of migrationNames) {
    const sql = await readFile(join(MIGRATIONS_DIRECTORY, migrationName, 'migration.sql'), 'utf8');
    await runOn(url, sql);
  }
}

async function runOn(url: string, sql: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

function withDatabase(serverUrl: string, databaseName: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
