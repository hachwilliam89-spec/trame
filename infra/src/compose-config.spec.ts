import {
  type ComposeService,
  isolatedEnvironment,
  readEnvExample,
  resolvedComposeConfig,
} from './lib/compose';

// Une image figée porte une version mineure au moins (PostgreSQL : 18.6, RabbitMQ : 4.3.7) et le
// digest de son index multi-architecture : le tag seul peut être republié, le digest non.
const PINNED_IMAGE = /^[a-z0-9./-]+:\d+\.\d+(\.\d+)?[a-z0-9.-]*@sha256:[a-f0-9]{64}$/;

describe('configuration Compose de dev, résolue avec .env.example', () => {
  let services: Record<string, ComposeService>;
  let envExample: Record<string, string | undefined>;

  beforeAll(async () => {
    services = (await resolvedComposeConfig()).services;
    envExample = await readEnvExample();
  });

  it('contient PostgreSQL, RabbitMQ et Keycloak', () => {
    expect(Object.keys(services).sort()).toEqual(['keycloak', 'postgres', 'rabbitmq']);
  });

  it('ne publie chaque port que sur 127.0.0.1, jamais sur toutes les interfaces', () => {
    const hostAddresses: string[] = [];
    for (const service of Object.values(services)) {
      for (const port of service.ports ?? []) {
        hostAddresses.push(port.host_ip ?? 'toutes les interfaces');
      }
    }

    expect(hostAddresses).toHaveLength(4);
    expect(new Set(hostAddresses)).toEqual(new Set(['127.0.0.1']));
  });

  it('déclare un healthcheck pour chaque service, condition de --wait', () => {
    for (const [name, service] of Object.entries(services)) {
      expect(service.healthcheck?.test?.length ?? 0, name).toBeGreaterThan(0);
    }
  });

  it('fige chaque image par version complète et digest', () => {
    for (const service of Object.values(services)) {
      expect(service.image).toMatch(PINNED_IMAGE);
    }
  });

  it('garde les données dans des volumes nommés, conservés après suppression des conteneurs', () => {
    expect(namedVolumeTargets(services['postgres'])).toEqual(['/var/lib/postgresql']);
    expect(namedVolumeTargets(services['rabbitmq'])).toEqual(['/var/lib/rabbitmq']);
  });

  it('crée la base et le compte PostgreSQL décrits par DATABASE_URL', () => {
    const databaseUrl = new URL(envExample['DATABASE_URL'] ?? '');
    const environment = services['postgres']?.environment ?? {};

    expect({
      user: environment['POSTGRES_USER'],
      password: environment['POSTGRES_PASSWORD'],
      database: environment['POSTGRES_DB'],
      port: publishedPort(services['postgres'], 5432),
    }).toEqual({
      user: databaseUrl.username,
      password: databaseUrl.password,
      database: databaseUrl.pathname.slice(1),
      port: databaseUrl.port,
    });
  });

  it('crée le compte RabbitMQ documenté dans .env.example', () => {
    const environment = services['rabbitmq']?.environment ?? {};

    expect(environment['RABBITMQ_DEFAULT_USER']).toBe(envExample['RABBITMQ_USER']);
    expect(environment['RABBITMQ_DEFAULT_PASS']).toBe(envExample['RABBITMQ_PASSWORD']);
    expect(envExample['RABBITMQ_USER']).toBeTruthy();
  });
});

// Nx charge le `.env` de la racine dans l'environnement de chaque commande, et Compose fait
// primer l'environnement sur le fichier passé par --env-file : sans isolation, les tests
// liraient les valeurs personnelles du développeur au lieu de `.env.example`.
describe('isolation du .env personnel', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("résout la configuration avec .env.example, même quand l'environnement porte d'autres valeurs", async () => {
    vi.stubEnv('POSTGRES_PORT', '15432');
    vi.stubEnv('POSTGRES_PASSWORD', 'mot-de-passe-personnel');
    vi.stubEnv('RABBITMQ_USER', 'compte-personnel');
    const envExample = await readEnvExample();

    const { services } = await resolvedComposeConfig();

    expect({
      postgresPort: publishedPort(services['postgres'], 5432),
      postgresPassword: services['postgres']?.environment?.['POSTGRES_PASSWORD'],
      rabbitmqUser: services['rabbitmq']?.environment?.['RABBITMQ_DEFAULT_USER'],
    }).toEqual({
      postgresPort: envExample['POSTGRES_PORT'],
      postgresPassword: envExample['POSTGRES_PASSWORD'],
      rabbitmqUser: envExample['RABBITMQ_USER'],
    });
  });

  it('retire des processus lancés les variables de .env.example, et garde les autres', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://personnel:secret@localhost:15432/perso');
    vi.stubEnv('LOG_LEVEL', 'trace');
    vi.stubEnv('DOCKER_HOST', 'unix:///run/docker.sock');

    const environment = await isolatedEnvironment({ LOG_LEVEL: 'silent' });

    expect(environment['DATABASE_URL']).toBeUndefined();
    expect(environment['LOG_LEVEL']).toBe('silent');
    expect(environment['DOCKER_HOST']).toBe('unix:///run/docker.sock');
    expect(environment['PATH']).toBe(process.env['PATH']);
  });

  it('applique quand même les valeurs imposées par le test', async () => {
    vi.stubEnv('POSTGRES_PORT', '15432');

    const { services } = await resolvedComposeConfig({ overrides: { POSTGRES_PORT: '25432' } });

    expect(publishedPort(services['postgres'], 5432)).toBe('25432');
  });
});

function namedVolumeTargets(service: ComposeService | undefined): string[] {
  const targets: string[] = [];
  for (const volume of service?.volumes ?? []) {
    if (volume.type === 'volume' && volume.source) {
      targets.push(volume.target);
    }
  }
  return targets;
}

function publishedPort(
  service: ComposeService | undefined,
  containerPort: number,
): string | undefined {
  return service?.ports?.find((port) => port.target === containerPort)?.published;
}
