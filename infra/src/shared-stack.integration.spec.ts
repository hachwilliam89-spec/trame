import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { type ScriptRun, runScriptInContainer } from './lib/container-script';
import { COMPOSE_DIRECTORY } from './lib/deployed-stacks';

/**
 * Démarrage réel de la stack partagée (US-005 B2a, #47), durcie comme sur le VPS. Le test de
 * politique lit la configuration ; il ne voit ni un réseau manquant, ni une écriture que la
 * lecture seule refuse.
 */
const run = promisify(execFile);
const PROJECT = `trame-shared-test-${process.pid}`;
const SHARED_FILE = join(COMPOSE_DIRECTORY, 'shared.yml');
const PROVISIONING_DIRECTORY = join(__dirname, '../provisioning');
const EDGE_NETWORK = 'edge';
const STAGING_ISSUER = 'https://auth.trame.wkhach.dev/realms/trame-staging';

function secret(): string {
  return randomBytes(24).toString('base64url');
}

describe('stack partagée démarrée comme sur le VPS (US-005 B2a)', () => {
  let secretsDirectory: string;
  let createdEdgeNetwork = false;
  const secrets = {
    postgres: secret(),
    rabbitmqAdmin: secret(),
    keycloakDatabase: secret(),
    keycloakAdmin: secret(),
    stagingMigrator: secret(),
    stagingApi: secret(),
    stagingRelay: secret(),
    stagingWorker: secret(),
  };

  beforeAll(async () => {
    secretsDirectory = await mkdtemp(join(tmpdir(), 'trame-shared-secrets-'));
    await writeFile(
      join(secretsDirectory, 'postgres.env'),
      `POSTGRES_PASSWORD=${secrets.postgres}\n`,
    );
    await writeFile(
      join(secretsDirectory, 'rabbitmq.env'),
      `RABBITMQ_DEFAULT_USER=trame-admin\nRABBITMQ_DEFAULT_PASS=${secrets.rabbitmqAdmin}\n`,
    );
    await writeFile(
      join(secretsDirectory, 'keycloak.env'),
      [
        `KC_DB_PASSWORD=${secrets.keycloakDatabase}`,
        'KC_BOOTSTRAP_ADMIN_USERNAME=test-admin',
        `KC_BOOTSTRAP_ADMIN_PASSWORD=${secrets.keycloakAdmin}`,
        '',
      ].join('\n'),
    );
    // Sur le VPS, `edge` appartient à la stack vps-edge. Ici, il n'existe que pour ce test.
    try {
      await run('docker', ['network', 'inspect', EDGE_NETWORK]);
    } catch {
      await run('docker', ['network', 'create', EDGE_NETWORK]);
      createdEdgeNetwork = true;
    }
  });

  afterAll(async () => {
    await shared('down', '--volumes', '--remove-orphans').catch(() => undefined);
    if (createdEdgeNetwork) {
      await run('docker', ['network', 'rm', EDGE_NETWORK]).catch(() => undefined);
    }
    await rm(secretsDirectory, { recursive: true, force: true });
  });

  async function shared(...args: string[]): Promise<string> {
    const { stdout } = await run(
      'docker',
      ['compose', '--project-name', PROJECT, '--file', SHARED_FILE, ...args],
      {
        env: {
          ...process.env,
          TRAME_SECRETS_DIR: secretsDirectory,
          KEYCLOAK_ADMIN_URL: 'http://127.0.0.1:18080',
        },
        maxBuffer: 16 * 1024 * 1024,
        timeout: 600_000,
      },
    );
    return stdout;
  }

  /** Démarre des services et attend qu'ils soient sains ; sinon, joint leurs journaux. */
  async function startHealthy(...services: string[]): Promise<void> {
    try {
      await shared('up', '--detach', '--wait', '--wait-timeout', '300', ...services);
    } catch (error) {
      const logs = await shared('logs', '--no-color', '--tail', '80', ...services).catch(
        (logError: unknown) => String(logError),
      );
      throw new Error(`${String(error)}\n--- journaux ---\n${logs}`);
    }
  }

  async function containerOf(service: string): Promise<string> {
    return (await shared('ps', '--quiet', service)).trim();
  }

  async function provision(
    service: string,
    command: string[],
    script: string,
    environment: Record<string, string>,
  ): Promise<ScriptRun> {
    return runScriptInContainer({
      containerId: await containerOf(service),
      command,
      scriptPath: join(PROVISIONING_DIRECTORY, script),
      environment,
    });
  }

  function psql(script: string, environment: Record<string, string> = {}): Promise<ScriptRun> {
    return provision(
      'postgres',
      ['psql', '--no-psqlrc', '--username', 'postgres', '--dbname', 'postgres'],
      script,
      environment,
    );
  }

  function expectSuccess(scriptRun: ScriptRun): void {
    expect({ exitCode: scriptRun.exitCode, stderr: scriptRun.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });
  }

  /** Requête HTTP depuis le conteneur Keycloak lui-même : la stack ne publie aucun port. */
  async function keycloakGet(path: string): Promise<string> {
    const request = `GET ${path} HTTP/1.0\\r\\nHost: 127.0.0.1\\r\\n\\r\\n`;
    const response = await shared(
      'exec',
      '-T',
      'keycloak',
      'bash',
      '-ec',
      `exec 3<>/dev/tcp/127.0.0.1/8080; printf '${request}' >&3; cat <&3`,
    );
    return response.slice(response.indexOf('\r\n\r\n') + 4);
  }

  it('construit Keycloak préparé, puis démarre PostgreSQL et RabbitMQ durcis', async () => {
    await shared('build', 'keycloak');

    await startHealthy('postgres', 'rabbitmq');
  }, 900_000);

  it('provisionne le serveur partagé : bases système fermées, Keycloak et staging', async () => {
    expectSuccess(await psql('postgres-cluster.sql'));
    expectSuccess(
      await psql('postgres-keycloak.sql', {
        TRAME_KEYCLOAK_DATABASE_PASSWORD: secrets.keycloakDatabase,
      }),
    );
    expectSuccess(
      await psql('postgres-environment.sql', {
        TRAME_ENVIRONMENT: 'staging',
        TRAME_MIGRATOR_PASSWORD: secrets.stagingMigrator,
        TRAME_API_PASSWORD: secrets.stagingApi,
      }),
    );
    expectSuccess(
      await provision('rabbitmq', ['sh', '-s'], 'rabbitmq-environment.sh', {
        TRAME_ENVIRONMENT: 'staging',
        TRAME_RELAY_PASSWORD: secrets.stagingRelay,
        TRAME_WORKER_PASSWORD: secrets.stagingWorker,
      }),
    );
  });

  it('ne crée pas guest dans RabbitMQ : seul l’administrateur des secrets existe en plus', async () => {
    const output = await shared(
      'exec',
      '-T',
      'rabbitmq',
      'rabbitmqctl',
      '--silent',
      '--formatter',
      'json',
      'list_users',
    );
    const users = (JSON.parse(output) as { user: string }[]).map((entry) => entry.user).sort();

    expect(users).toEqual(['trame-admin', 'trame_staging_relay', 'trame_staging_worker']);
  });

  it('démarre Keycloak en lecture seule, relié à sa base, avec le realm de staging importé', async () => {
    await startHealthy('keycloak');

    const configuration = JSON.parse(
      await keycloakGet('/realms/trame-staging/.well-known/openid-configuration'),
    ) as { issuer: string };
    expect(configuration.issuer).toBe(STAGING_ISSUER);
    // Les tables de Keycloak sont dans sa base PostgreSQL, jointe par le réseau trame-data.
    const tables = await shared(
      'exec',
      '-T',
      'postgres',
      'psql',
      '--no-psqlrc',
      '-At',
      '--username',
      'postgres',
      '--dbname',
      'keycloak',
      '--command',
      "SELECT count(*) FROM pg_tables WHERE tablename = 'realm'",
    );
    expect(tables.trim()).toBe('1');
  }, 600_000);
});
