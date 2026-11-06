import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { type ScriptRun, runScriptInContainer } from './lib/container-script';
import { devStackImage } from './lib/pinned-images';

/**
 * Provisionnement PostgreSQL d'US-005 B2a (#47) sur un vrai serveur, à l'image figée de `dev.yml` :
 * rôles migrator et api, base de Keycloak, isolation entre bases, rotation des mots de passe.
 */
const PROVISIONING_DIRECTORY = join(__dirname, '../provisioning');
const DATABASE_LIBRARY = join(__dirname, '../../libs/api/shared/database');
const PRISMA = join(__dirname, '../../node_modules/.bin/prisma');
const PERMISSION_DENIED = '42501';
const INVALID_PASSWORD = '28P01';
const SITE_ID = '019a4ac0-0000-7000-8000-0000000000c1';
const ORGANIZATION_ID = '019a4ac0-0000-7000-8000-0000000000c2';
/**
 * Toute la journalisation de requêtes de PostgreSQL activée, comme sur un serveur réglé pour le
 * diagnostic : le provisionnement ne doit y laisser aucun mot de passe.
 */
const STATEMENT_LOGGING_SERVER = [
  'postgres',
  '-c',
  'log_statement=all',
  '-c',
  'log_duration=on',
  '-c',
  'log_min_duration_statement=0',
  '-c',
  'log_min_duration_sample=0',
  '-c',
  'log_statement_sample_rate=1',
  '-c',
  'log_transaction_sample_rate=1',
  '-c',
  'debug_print_parse=on',
];

interface EnvironmentSecrets {
  migrator?: string;
  api?: string;
}

interface Credentials {
  user: string;
  password: string;
}

describe('provisionnement PostgreSQL d’un environnement (US-005 B2a)', () => {
  let server: StartedPostgreSqlContainer;
  const testRun = String(process.pid);
  const staging = { migrator: `staging-migrator-${testRun}`, api: `staging-api-${testRun}` };
  const production = { migrator: `prod-migrator-${testRun}`, api: `prod-api-${testRun}` };
  const keycloakPassword = `keycloak-${testRun}`;
  const rotated = { migrator: `rotated-migrator-${testRun}`, api: `rotated-api-${testRun}` };
  const allSecrets = [
    staging.migrator,
    staging.api,
    production.migrator,
    production.api,
    keycloakPassword,
    rotated.migrator,
    rotated.api,
  ];

  beforeAll(async () => {
    server = await new PostgreSqlContainer(devStackImage('postgres'))
      .withCommand(STATEMENT_LOGGING_SERVER)
      .start();
  });

  afterAll(async () => {
    await server?.stop();
  });

  function runPsqlScript(script: string, environment: Record<string, string>): Promise<ScriptRun> {
    return runScriptInContainer({
      containerId: server.getId(),
      command: ['psql', '--no-psqlrc', '--username', server.getUsername(), '--dbname', 'postgres'],
      scriptPath: join(PROVISIONING_DIRECTORY, script),
      environment,
    });
  }

  function provisionEnvironment(name: string, secrets: EnvironmentSecrets): Promise<ScriptRun> {
    const environment: Record<string, string> = { TRAME_ENVIRONMENT: name };
    if (secrets.migrator !== undefined) {
      environment['TRAME_MIGRATOR_PASSWORD'] = secrets.migrator;
    }
    if (secrets.api !== undefined) {
      environment['TRAME_API_PASSWORD'] = secrets.api;
    }
    return runPsqlScript('postgres-environment.sql', environment);
  }

  function expectSuccess(run: ScriptRun): void {
    expect({ exitCode: run.exitCode, stderr: run.stderr }).toEqual({ exitCode: 0, stderr: '' });
  }

  function expectNoSecretIn(run: ScriptRun): void {
    for (const secret of allSecrets) {
      expect(run.stdout + run.stderr).not.toContain(secret);
    }
  }

  async function connect(credentials: Credentials, database: string): Promise<Client> {
    const client = new Client({
      host: server.getHost(),
      port: server.getPort(),
      user: credentials.user,
      password: credentials.password,
      database,
      connectionTimeoutMillis: 10_000,
    });
    await client.connect();
    return client;
  }

  async function query(
    credentials: Credentials,
    database: string,
    sql: string,
  ): Promise<unknown[]> {
    const client = await connect(credentials, database);
    try {
      return (await client.query(sql)).rows;
    } finally {
      await client.end();
    }
  }

  /** Le code SQLSTATE de l'erreur, ou « réussi » quand PostgreSQL accepte. */
  async function outcomeOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
      return 'réussi';
    } catch (error) {
      return (error as { code?: string }).code ?? String(error);
    }
  }

  function superuser(): Credentials {
    return { user: server.getUsername(), password: server.getPassword() };
  }

  function stagingApi(password = staging.api): Credentials {
    return { user: 'trame_staging_api', password };
  }

  function stagingMigrator(password = staging.migrator): Credentials {
    return { user: 'trame_staging_migrator', password };
  }

  async function serverLog(): Promise<string> {
    const { stdout, stderr } = await promisify(execFile)('docker', ['logs', server.getId()], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30_000,
    });
    return stdout + stderr;
  }

  async function migrate(credentials: Credentials, database: string): Promise<void> {
    const url = new URL(`postgresql://${server.getHost()}:${server.getPort()}/${database}`);
    url.username = credentials.user;
    url.password = credentials.password;
    await promisify(execFile)(PRISMA, ['migrate', 'deploy'], {
      cwd: DATABASE_LIBRARY,
      env: { ...process.env, DATABASE_URL: url.toString() },
      timeout: 120_000,
    });
  }

  it('Paramètre manquant : refuse un environnement inconnu ou un mot de passe absent, sans rien créer', async () => {
    const unknownEnvironment = await provisionEnvironment('recette', staging);
    const missingPassword = await provisionEnvironment('staging', { migrator: staging.migrator });
    const missingKeycloakPassword = await runPsqlScript('postgres-keycloak.sql', {});

    for (const run of [unknownEnvironment, missingPassword, missingKeycloakPassword]) {
      expect(run.exitCode).not.toBe(0);
      expectNoSecretIn(run);
    }
    const created = await query(
      superuser(),
      'postgres',
      `SELECT rolname AS name FROM pg_roles WHERE rolname LIKE 'trame%' OR rolname = 'keycloak'
       UNION ALL
       SELECT datname FROM pg_database WHERE datname LIKE 'trame%' OR datname = 'keycloak'`,
    );
    expect(created).toEqual([]);
  });

  it('provisionne staging, production et la base de Keycloak sur le même serveur', async () => {
    const runs = [
      await provisionEnvironment('staging', staging),
      await provisionEnvironment('production', production),
      await runPsqlScript('postgres-keycloak.sql', {
        TRAME_KEYCLOAK_DATABASE_PASSWORD: keycloakPassword,
      }),
    ];

    for (const run of runs) {
      expectSuccess(run);
      expectNoSecretIn(run);
    }
  });

  it('Migrations par le rôle migrator, données par le rôle api', async () => {
    await migrate(stagingMigrator(), 'trame_staging');

    const client = await connect(stagingApi(), 'trame_staging');
    try {
      await client.query(
        `INSERT INTO organization.sites (id, organization_id, code, name, time_zone, created_at)
         VALUES ($1, $2, 'MUL', 'Mulhouse', 'Europe/Paris', now())`,
        [SITE_ID, ORGANIZATION_ID],
      );
      await client.query(`UPDATE organization.sites SET name = 'Mulhouse Nord' WHERE id = $1`, [
        SITE_ID,
      ]);
      const sites = await client.query('SELECT name FROM organization.sites');
      expect(sites.rows).toEqual([{ name: 'Mulhouse Nord' }]);
    } finally {
      await client.end();
    }
  });

  it('Rôle applicatif sans DDL : PostgreSQL refuse, et l’historique des migrations reste fermé', async () => {
    const forbiddenStatements = [
      'CREATE TABLE organization.intrus (id integer)',
      'ALTER TABLE organization.sites ADD COLUMN intrus integer',
      'DROP TABLE organization.sites',
      'TRUNCATE organization.sites',
      'CREATE SCHEMA intrus',
      'CREATE TABLE public.intrus (id integer)',
      'SELECT * FROM public._prisma_migrations',
    ];

    for (const statement of forbiddenStatements) {
      const outcome = await outcomeOf(() => query(stagingApi(), 'trame_staging', statement));
      expect({ statement, outcome }).toEqual({ statement, outcome: PERMISSION_DENIED });
    }
  });

  it('Isolation des données : aucune connexion à la base d’un autre environnement ou de Keycloak', async () => {
    const productionApi = { user: 'trame_production_api', password: production.api };
    const keycloak = { user: 'keycloak', password: keycloakPassword };
    const crossAccesses: [Credentials, string][] = [
      [stagingApi(), 'trame_production'],
      [stagingMigrator(), 'trame_production'],
      [stagingApi(), 'keycloak'],
      [stagingMigrator(), 'keycloak'],
      [productionApi, 'trame_staging'],
      [keycloak, 'trame_staging'],
    ];

    for (const [credentials, database] of crossAccesses) {
      const outcome = await outcomeOf(() => query(credentials, database, 'SELECT 1'));
      expect({ user: credentials.user, database, outcome }).toEqual({
        user: credentials.user,
        database,
        outcome: PERMISSION_DENIED,
      });
    }
  });

  it('ouvre sa base à Keycloak, qui y crée ses propres tables', async () => {
    const keycloak = { user: 'keycloak', password: keycloakPassword };

    await query(keycloak, 'keycloak', 'CREATE TABLE public.realm_probe (id integer)');
    expect(
      await query(keycloak, 'keycloak', 'SELECT count(*)::int AS rows FROM realm_probe'),
    ).toEqual([{ rows: 0 }]);
  });

  it('Provisionnement rejouable : change les mots de passe sans toucher aux données', async () => {
    expectSuccess(await provisionEnvironment('staging', rotated));

    expect(await outcomeOf(() => query(stagingApi(), 'trame_staging', 'SELECT 1'))).toBe(
      INVALID_PASSWORD,
    );
    expect(
      await query(stagingApi(rotated.api), 'trame_staging', 'SELECT name FROM organization.sites'),
    ).toEqual([{ name: 'Mulhouse Nord' }]);
    // Le migrator garde la main sur le schéma : aucune migration en attente, aucune erreur.
    await migrate(stagingMigrator(rotated.migrator), 'trame_staging');
  });

  it('ferme aux rôles d’environnement les bases système, sans en priver le superutilisateur', async () => {
    const stagingRoles = [stagingApi(rotated.api), stagingMigrator(rotated.migrator)];
    const systemDatabases = ['postgres', 'template1'];
    for (const credentials of stagingRoles) {
      for (const database of systemDatabases) {
        expect(await outcomeOf(() => query(credentials, database, 'SELECT 1'))).toBe('réussi');
      }
    }

    const run = await runPsqlScript('postgres-cluster.sql', {});

    expectSuccess(run);
    for (const credentials of stagingRoles) {
      for (const database of systemDatabases) {
        const outcome = await outcomeOf(() => query(credentials, database, 'SELECT 1'));
        expect({ user: credentials.user, database, outcome }).toEqual({
          user: credentials.user,
          database,
          outcome: PERMISSION_DENIED,
        });
      }
    }
    for (const database of systemDatabases) {
      expect(await query(superuser(), database, 'SELECT 1 AS ok')).toEqual([{ ok: 1 }]);
    }
    // Une base créée ensuite garde ses propres droits : template1 n'en transmet aucun.
    expectSuccess(await runPsqlScript('postgres-cluster.sql', {}));
    expect(await query(stagingApi(rotated.api), 'trame_staging', 'SELECT 1 AS ok')).toEqual([
      { ok: 1 },
    ]);
  });

  it('Journal du serveur sans secret, même quand toutes les requêtes sont journalisées', async () => {
    await query(superuser(), 'postgres', `SELECT 'temoin-journal-${testRun}'`);

    const log = await serverLog();

    // Témoin : le serveur a bien journalisé une requête du test.
    expect(log).toContain(`temoin-journal-${testRun}`);
    for (const secret of allSecrets) {
      expect(log.includes(secret), `secret présent dans le journal : ${secret}`).toBe(false);
    }
  });
});
