import { connect } from 'amqplib';
import { type ComposeOptions, compose, readEnvExample } from './lib/compose';
import {
  type ApiProcess,
  acceptsConnection,
  externalIpv4Address,
  queryDatabase,
  reserveFreePort,
  runPrisma,
  serviceHealth,
  startApi,
  startStack,
} from './lib/dev-stack';

// Une stack dédiée : son propre nom de projet (donc ses propres volumes) et des ports libres,
// pour ne gêner ni la stack du développeur ni la base du job d'intégration de la CI.
const PROJECT_NAME = 'trame-dev-integration';

// Les scénarios s'enchaînent sur une même stack, dans l'ordre du fichier : la démarrer pour
// chacun coûterait plusieurs minutes.
describe('stack de dev démarrée réellement (US-004)', () => {
  let options: ComposeOptions;
  let databaseUrl: string;
  let rabbitmq: { port: number; managementPort: number; username: string; password: string };
  let apiPort: number;
  let api: ApiProcess | undefined;

  beforeAll(async () => {
    const envExample = await readEnvExample();
    const postgresPort = await reserveFreePort();
    rabbitmq = {
      port: await reserveFreePort(),
      managementPort: await reserveFreePort(),
      username: envExample['RABBITMQ_USER'] ?? '',
      password: envExample['RABBITMQ_PASSWORD'] ?? '',
    };
    apiPort = await reserveFreePort();
    options = {
      projectName: PROJECT_NAME,
      overrides: {
        POSTGRES_PORT: String(postgresPort),
        RABBITMQ_PORT: String(rabbitmq.port),
        RABBITMQ_MANAGEMENT_PORT: String(rabbitmq.managementPort),
        KEYCLOAK_PORT: String(await reserveFreePort()),
      },
    };
    const url = new URL(envExample['DATABASE_URL'] ?? '');
    url.port = String(postgresPort);
    databaseUrl = url.toString();

    // Un run précédent interrompu a pu laisser des conteneurs ou des volumes.
    await compose(['down', '--volumes'], options);
  });

  afterAll(async () => {
    await api?.stop();
    await compose(['down', '--volumes'], options);
  });

  it('démarre PostgreSQL et RabbitMQ, sains en moins de 2 minutes', async () => {
    await startStack(options);

    expect(await serviceHealth(options)).toEqual({
      postgres: 'healthy',
      rabbitmq: 'healthy',
      keycloak: 'healthy',
    });
  });

  it('applique les migrations, sans écart avec le schéma Prisma', async () => {
    await expect(runPrisma(['migrate', 'deploy'], databaseUrl)).resolves.toBeUndefined();

    const diff = [
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--exit-code',
    ];
    await expect(runPrisma(diff, databaseUrl)).resolves.toBeUndefined();
  });

  it("répond 200 sur health/ready quand l'API démarre sur la base locale", async () => {
    api = await startApi(apiPort, databaseUrl);

    const response = await fetch(`${api.baseUrl}/health/ready`);

    expect(response.status).toBe(200);
  });

  const externalAddress = externalIpv4Address();

  it.skipIf(externalAddress === undefined)(
    "refuse les connexions à l'API et aux services par l'adresse réseau du poste",
    async () => {
      const listening: Record<string, boolean> = {};
      const ports = {
        api: apiPort,
        postgres: Number(options.overrides?.['POSTGRES_PORT']),
        rabbitmq: rabbitmq.port,
        management: rabbitmq.managementPort,
      };
      for (const [name, port] of Object.entries(ports)) {
        listening[name] = await acceptsConnection(externalAddress ?? '', port);
      }

      expect(listening).toEqual({
        api: false,
        postgres: false,
        rabbitmq: false,
        management: false,
      });
    },
  );

  it('répond 503 en problem+json sur health/ready quand PostgreSQL est arrêté', async () => {
    await compose(['stop', 'postgres'], options);

    const response = await fetch(`${api?.baseUrl}/health/ready`);

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json/);
    await startStack(options, ['postgres']);
  });

  it('accepte une connexion AMQP avec les identifiants de .env.example', async () => {
    const connection = await connect({
      hostname: '127.0.0.1',
      port: rabbitmq.port,
      username: rabbitmq.username,
      password: rabbitmq.password,
    });

    await expect(connection.close()).resolves.toBeUndefined();
  });

  it("ouvre l'interface de management avec ces mêmes identifiants", async () => {
    const credentials = Buffer.from(`${rabbitmq.username}:${rabbitmq.password}`).toString('base64');

    const response = await fetch(`http://127.0.0.1:${rabbitmq.managementPort}/api/whoami`, {
      headers: { authorization: `Basic ${credentials}` },
    });

    expect(response.status).toBe(200);
  });

  it('conserve les données après suppression puis recréation des conteneurs', async () => {
    await api?.stop();
    api = undefined;
    await queryDatabase(databaseUrl, 'CREATE TABLE persistence_probe (label text)');
    await queryDatabase(databaseUrl, "INSERT INTO persistence_probe VALUES ('conservée')");

    await compose(['down'], options);
    await startStack(options);

    expect(
      await queryDatabase(databaseUrl, "SELECT to_regclass('persistence_probe')::text AS probe"),
    ).toEqual([{ probe: 'persistence_probe' }]);
    expect(await queryDatabase(databaseUrl, 'SELECT label FROM persistence_probe')).toEqual([
      { label: 'conservée' },
    ]);
  });

  it("repart d'une base vide après la remise à zéro, puis réapplique les migrations", async () => {
    await compose(['down', '--volumes'], options);
    await startStack(options);

    expect(
      await queryDatabase(databaseUrl, "SELECT to_regclass('persistence_probe')::text AS probe"),
    ).toEqual([{ probe: null }]);
    await expect(runPrisma(['migrate', 'deploy'], databaseUrl)).resolves.toBeUndefined();
  });
});
