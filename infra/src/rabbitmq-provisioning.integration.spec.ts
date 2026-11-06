import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { type ChannelModel, type ConfirmChannel, connect } from 'amqplib';
import { type ScriptRun, runScriptInContainer } from './lib/container-script';
import { devStackImage } from './lib/pinned-images';

/**
 * Provisionnement RabbitMQ d'US-005 B2a (#47) sur un vrai serveur, à l'image figée de `dev.yml` :
 * un vhost par environnement, un utilisateur pour le relay et un pour le worker, limités à ce vhost.
 */
const PROVISIONING_SCRIPT = join(__dirname, '../provisioning/rabbitmq-environment.sh');
const TOPOLOGY_FILE = join(__dirname, '../rabbitmq/diagnostic-topology.json');
const MANAGEMENT_PORT = 15672;

interface QueueTopology {
  name: string;
  routingKey: string;
  arguments: Record<string, unknown>;
}

interface DiagnosticTopology {
  exchange: string;
  requests: QueueTopology;
  reports: QueueTopology;
  deadLetters: QueueTopology;
  parking: QueueTopology;
}

interface EnvironmentSecrets {
  relay?: string;
  worker?: string;
}

interface BrokerAccount {
  user: string;
  password: string;
  vhost: string;
}

describe('provisionnement RabbitMQ d’un environnement (US-005 B2a)', () => {
  let broker: StartedRabbitMQContainer;
  let topology: DiagnosticTopology;
  const testRun = String(process.pid);
  const staging = { relay: `staging-relay-${testRun}`, worker: `staging-worker-${testRun}` };
  const production = { relay: `prod-relay-${testRun}`, worker: `prod-worker-${testRun}` };
  const allSecrets = [staging.relay, staging.worker, production.relay, production.worker];
  const openConnections: ChannelModel[] = [];
  const administrator = { user: 'test-admin', password: `admin-${testRun}` };

  beforeAll(async () => {
    topology = JSON.parse(await readFile(TOPOLOGY_FILE, 'utf8')) as DiagnosticTopology;
    broker = await new RabbitMQContainer(devStackImage('rabbitmq'))
      .withEnvironment({
        RABBITMQ_DEFAULT_USER: administrator.user,
        RABBITMQ_DEFAULT_PASS: administrator.password,
      })
      .withStartupTimeout(120_000)
      .start();
  });

  afterEach(async () => {
    for (const connection of openConnections.splice(0)) {
      await connection.close().catch(() => undefined);
    }
  });

  afterAll(async () => {
    await broker?.stop();
  });

  function provision(environment: string, secrets: EnvironmentSecrets): Promise<ScriptRun> {
    const variables: Record<string, string> = { TRAME_ENVIRONMENT: environment };
    if (secrets.relay !== undefined) {
      variables['TRAME_RELAY_PASSWORD'] = secrets.relay;
    }
    if (secrets.worker !== undefined) {
      variables['TRAME_WORKER_PASSWORD'] = secrets.worker;
    }
    return runScriptInContainer({
      containerId: broker.getId(),
      command: ['sh', '-s'],
      scriptPath: PROVISIONING_SCRIPT,
      environment: variables,
    });
  }

  function expectSuccess(run: ScriptRun): void {
    expect({ exitCode: run.exitCode, stderr: run.stderr }).toEqual({ exitCode: 0, stderr: '' });
  }

  function expectNoSecretIn(run: ScriptRun): void {
    for (const secret of allSecrets) {
      expect(run.stdout + run.stderr).not.toContain(secret);
    }
  }

  /** Une liste de l'outil d'administration du serveur, au format JSON. */
  async function rabbitmqctlList<Entry>(...command: string[]): Promise<Entry[]> {
    const { stdout } = await promisify(execFile)(
      'docker',
      ['exec', broker.getId(), 'rabbitmqctl', '--silent', '--formatter', 'json', ...command],
      { timeout: 30_000 },
    );
    return JSON.parse(stdout) as Entry[];
  }

  /** Les utilisateurs ou les vhosts de Trame. */
  async function trameEntries<Entry extends { name?: string; user?: string }>(
    command: 'list_users' | 'list_vhosts',
  ): Promise<Entry[]> {
    const entries = await rabbitmqctlList<Entry>(command);
    return entries.filter((entry) => (entry.name ?? entry.user ?? '').startsWith('trame'));
  }

  function account(environment: string, service: string, password: string): BrokerAccount {
    return { user: `trame_${environment}_${service}`, password, vhost: `trame-${environment}` };
  }

  async function open(brokerAccount: BrokerAccount): Promise<ConfirmChannel> {
    const url = new URL(broker.getAmqpUrl());
    url.username = brokerAccount.user;
    url.password = brokerAccount.password;
    url.pathname = `/${encodeURIComponent(brokerAccount.vhost)}`;
    const connection = await connect(url.toString(), { timeout: 10_000 });
    openConnections.push(connection);
    return connection.createConfirmChannel();
  }

  /** Les mêmes déclarations que le transport (TypeScript) et le worker (Python), dans le même ordre. */
  async function declareTopology(channel: ConfirmChannel): Promise<void> {
    await channel.assertExchange(topology.exchange, 'direct', { durable: true });
    const queues = [topology.parking, topology.deadLetters, topology.requests, topology.reports];
    for (const queue of queues) {
      await channel.assertQueue(queue.name, { durable: true, arguments: queue.arguments });
      await channel.bindQueue(queue.name, topology.exchange, queue.routingKey);
    }
  }

  async function publish(
    channel: ConfirmChannel,
    queue: QueueTopology,
    body: string,
  ): Promise<void> {
    channel.publish(topology.exchange, queue.routingKey, Buffer.from(body), { persistent: true });
    await channel.waitForConfirms();
  }

  /** Consomme un message, comme le relay et le worker : une file quorum à consommateur unique
   * n'accepte pas de lecture ponctuelle (`basic.get`). */
  function receive(channel: ConfirmChannel, queue: QueueTopology): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Aucun message dans ${queue.name}.`)),
        10_000,
      );
      channel
        .consume(queue.name, (message) => {
          if (message === null) {
            return;
          }
          clearTimeout(timeout);
          channel.ack(message);
          resolve(message.content.toString());
          channel.cancel(message.fields.consumerTag).catch(() => undefined);
        })
        .catch((error: unknown) => {
          clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  async function managementStatus(credentials: {
    user: string;
    password: string;
  }): Promise<number> {
    const managementUrl = `http://${broker.getHost()}:${broker.getMappedPort(MANAGEMENT_PORT)}`;
    const basic = Buffer.from(`${credentials.user}:${credentials.password}`).toString('base64');
    const response = await fetch(`${managementUrl}/api/whoami`, {
      headers: { authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(10_000),
    });
    return response.status;
  }

  /** Le relay publie une demande que le worker reçoit, puis le worker publie le rapport. */
  async function exchangeDiagnostic(relay: ConfirmChannel, worker: ConfirmChannel): Promise<void> {
    await publish(relay, topology.requests, 'demande');
    expect(await receive(worker, topology.requests)).toBe('demande');
    await publish(worker, topology.reports, 'rapport');
    expect(await receive(relay, topology.reports)).toBe('rapport');
  }

  it('Paramètre manquant : refuse un environnement inconnu ou un mot de passe absent, sans rien créer', async () => {
    const unknownEnvironment = await provision('recette', staging);
    const missingPassword = await provision('staging', { relay: staging.relay });

    for (const run of [unknownEnvironment, missingPassword]) {
      expect(run.exitCode).not.toBe(0);
      expectNoSecretIn(run);
    }
    expect(await trameEntries('list_vhosts')).toEqual([]);
    expect(await trameEntries('list_users')).toEqual([]);
  });

  it('provisionne staging et production sur le même serveur, sans rôle de gestion', async () => {
    for (const run of [
      await provision('staging', staging),
      await provision('production', production),
    ]) {
      expectSuccess(run);
      expectNoSecretIn(run);
    }

    const users = await trameEntries<{ user: string; tags: string[] }>('list_users');
    const userNames = users.map((entry) => entry.user).sort();
    expect(userNames).toEqual([
      'trame_production_relay',
      'trame_production_worker',
      'trame_staging_relay',
      'trame_staging_worker',
    ]);
    for (const entry of users) {
      expect(entry.tags).toEqual([]);
    }
  });

  it('Messagerie : le relay démarre avant le worker, et chacun fait son travail', async () => {
    const relay = await open(account('staging', 'relay', staging.relay));
    await declareTopology(relay);
    const worker = await open(account('staging', 'worker', staging.worker));
    await declareTopology(worker);

    await exchangeDiagnostic(relay, worker);
  });

  it('Messagerie : le worker démarre avant le relay, et chacun fait son travail', async () => {
    const worker = await open(account('production', 'worker', production.worker));
    await declareTopology(worker);
    const relay = await open(account('production', 'relay', production.relay));
    await declareTopology(relay);

    await exchangeDiagnostic(relay, worker);
  });

  it('Messagerie : aucun accès au vhost d’un autre environnement, ni au vhost par défaut', async () => {
    const foreignVhosts: BrokerAccount[] = [
      { ...account('staging', 'relay', staging.relay), vhost: 'trame-production' },
      { ...account('staging', 'worker', staging.worker), vhost: 'trame-production' },
      { ...account('staging', 'relay', staging.relay), vhost: '/' },
      { ...account('production', 'worker', production.worker), vhost: 'trame-staging' },
    ];

    // amqplib ne transmet pas le motif du serveur : le refus se lit dans les permissions.
    for (const foreign of foreignVhosts) {
      await expect(open(foreign), `${foreign.user} sur ${foreign.vhost}`).rejects.toThrow(
        /ConnectionClose/,
      );
    }
    const onlyDiagnosticResources = '^trame\\.diagnostic\\.';
    for (const environment of ['staging', 'production']) {
      for (const service of ['relay', 'worker']) {
        const user = `trame_${environment}_${service}`;
        expect(await rabbitmqctlList('list_user_permissions', user)).toEqual([
          {
            vhost: `trame-${environment}`,
            configure: onlyDiagnosticResources,
            write: onlyDiagnosticResources,
            read: onlyDiagnosticResources,
          },
        ]);
      }
    }
  });

  it('Messagerie : aucun accès à l’interface de gestion', async () => {
    const relay = account('staging', 'relay', staging.relay);
    // Témoins : ces identifiants ouvrent la messagerie, et l'interface répond à un administrateur.
    await open(relay);
    expect(await managementStatus(administrator)).toBe(200);

    expect(await managementStatus(relay)).toBe(401);
  });

  it('Provisionnement rejouable : change les mots de passe sans toucher aux files', async () => {
    const seeder = await open(account('staging', 'relay', staging.relay));
    await publish(seeder, topology.requests, 'en attente');
    const rotated = { relay: `rotated-relay-${testRun}`, worker: `rotated-worker-${testRun}` };

    expectSuccess(await provision('staging', rotated));

    await expect(open(account('staging', 'relay', staging.relay))).rejects.toThrow(
      /ACCESS.REFUSED/,
    );
    const worker = await open(account('staging', 'worker', rotated.worker));
    expect(await receive(worker, topology.requests)).toBe('en attente');
  });
});
