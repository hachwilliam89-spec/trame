import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COMPOSE_DIRECTORY } from './lib/deployed-stacks';
import { type CommandRun, runCommand, runVisibleCommand } from './lib/rehearsal/command';
import { ContainerEventWatch } from './lib/rehearsal/container-events';
import { MemorySampler } from './lib/rehearsal/container-watch';
import {
  type ProbeTarget,
  containerAddresses,
  openAdminTunnel,
  publishedPorts,
  reachableFromOutside,
  removeOutsideNetwork,
} from './lib/rehearsal/exposure';
import { GitMainHistory } from './lib/rehearsal/git-main-history';
import { generatePlatformSecrets, writeSecretFiles } from './lib/rehearsal/platform-secrets';
import { type RehearsalReport, writeRehearsalReport } from './lib/rehearsal/rehearsal-report';
import {
  type RehearsedVersions,
  chooseRehearsedVersions,
} from './lib/rehearsal/rehearsed-versions';
import { KEYCLOAK_ADMIN_URL, SharedStack } from './lib/rehearsal/shared-stack';
import { type TestAuthority, createTestAuthority } from './lib/rehearsal/test-authority';

/**
 * Répétition du staging (US-005 B2a, étape 4, #47) : `deploy.sh` joué tel quel, avec les vraies
 * versions publiées et signées, la stack partagée provisionnée comme le runbook, et le Traefik de
 * vps-edge. Seuls le DNS public et Let's Encrypt manquent : /etc/hosts du runner et une autorité
 * de test les remplacent, sans désactiver la vérification TLS.
 *
 * Versions : TRAME_REHEARSAL_VERSION et TRAME_REHEARSAL_PREVIOUS, ou les deux dernières publiées.
 * Preuve : repetition.json et repetition.md dans TRAME_REHEARSAL_REPORT.
 */
const REPOSITORY_URL = 'https://github.com/hachwilliam89-spec/trame.git';
const RELEASE_REPOSITORY = 'ghcr.io/hachwilliam89-spec/trame-release';
const DEPLOY_SCRIPT = join(__dirname, '../staging/deploy.sh');
const EDGE_FILE = join(COMPOSE_DIRECTORY, 'rehearsal-edge.yml');
const PUBLIC_NAMES = ['staging.trame.wkhach.dev', 'auth.trame.wkhach.dev'];
const AUTH_URL = 'https://auth.trame.wkhach.dev';
const KEYCLOAK_IMAGE = 'trame-keycloak:26.8.1';
const ADMIN_TUNNEL_PORT = 18080;
/** Commits de main parcourus pour le choix par défaut ; une version demandée n'a pas de limite. */
const RECENT_MAIN_COMMITS = 60;

describe('répétition du staging (US-005 B2a, étape 4)', () => {
  const workDirectory = mkdtempSync(join(tmpdir(), 'trame-repetition-'));
  const root = join(workDirectory, 'trame');
  const secrets = generatePlatformSecrets();
  const sharedStack = new SharedStack(join(root, 'shared', 'secrets'));
  const sampler = new MemorySampler();
  const containerEvents = new ContainerEventWatch();
  const report: RehearsalReport = {
    scriptCommit: '',
    tools: {},
    steps: [],
    memoryPeaks: {},
    failedMemorySamples: 0,
    incidents: [],
  };
  let versions: RehearsedVersions;
  let authority: TestAuthority;
  let adminTunnel: Server | undefined;
  let samplerStopped = false;
  let eventsStopped = false;

  beforeAll(async () => {
    requirePublicNamesOnThisHost();
    report.scriptCommit = (await runCommand('git', ['rev-parse', 'HEAD'])).trim();
    report.tools = await releaseToolVersions();
    await runCommand('git', ['clone', '--quiet', REPOSITORY_URL, join(root, 'source')]);
    versions = await chooseVersions();
    report.target = { commit: versions.target, digests: '' };
    report.previous = { commit: versions.previous, digests: '' };

    authority = await createTestAuthority(join(workDirectory, 'autorite'), PUBLIC_NAMES);
    await writeSecretFiles(root, secrets);
    await runCommand('docker', ['network', 'create', 'edge']);
    await containerEvents.start();
    sampler.start();
    await edge('up', '--detach', '--wait', '--wait-timeout', '120');
    await sharedStack.start(secrets);
  });

  afterAll(async () => {
    adminTunnel?.close();
    await stopSampler();
    await stopContainerEvents().catch((error: unknown) => {
      report.incidents.push(`Flux des événements Docker : ${String(error)}`);
    });
    await writeRehearsalReport(reportDirectory(), report);
    await runCommand('docker', ['compose', '--project-name', 'trame-staging', 'down']).catch(
      () => '',
    );
    await sharedStack.remove().catch(() => undefined);
    await edge('down').catch(() => '');
    await runCommand('docker', ['network', 'rm', 'edge']).catch(() => '');
    await removeOutsideNetwork();
    rmSync(workDirectory, { recursive: true, force: true });
  });

  function requirePublicNamesOnThisHost(): void {
    const hosts = readFileSync('/etc/hosts', 'utf8');
    for (const name of PUBLIC_NAMES) {
      const mapped = new RegExp(`^127\\.0\\.0\\.1\\s.*\\b${name.replaceAll('.', '\\.')}\\b`, 'm');
      if (!mapped.test(hosts)) {
        throw new Error(`/etc/hosts doit diriger ${name} vers 127.0.0.1 (rehearsal.yml).`);
      }
    }
  }

  async function releaseToolVersions(): Promise<Record<string, string>> {
    const oras = /Version:\s*(\S+)/.exec(await runCommand('oras', ['version']))?.[1] ?? '';
    const cosign = JSON.parse(await runCommand('cosign', ['version', '--json'])) as {
      gitVersion?: string;
      GitVersion?: string;
    };
    return { oras, cosign: cosign.gitVersion ?? cosign.GitVersion ?? '' };
  }

  async function chooseVersions(): Promise<RehearsedVersions> {
    return chooseRehearsedVersions({
      main: new GitMainHistory(join(root, 'source'), RECENT_MAIN_COMMITS),
      requestedTarget: nonEmpty(process.env['TRAME_REHEARSAL_VERSION']),
      requestedPrevious: nonEmpty(process.env['TRAME_REHEARSAL_PREVIOUS']),
      isPublished: (commit) =>
        runCommand('oras', ['resolve', `${RELEASE_REPOSITORY}:${commit}`]).then(
          () => true,
          () => false,
        ),
    });
  }

  function nonEmpty(value: string | undefined): string | undefined {
    return value === undefined || value.trim() === '' ? undefined : value.trim();
  }

  function reportDirectory(): string {
    return process.env['TRAME_REHEARSAL_REPORT'] ?? join(tmpdir(), 'trame-repetition-rapport');
  }

  function edge(...args: string[]): Promise<string> {
    return runCommand('docker', ['compose', '--file', EDGE_FILE, ...args], {
      environment: { ...process.env, TRAME_REHEARSAL_CERTIFICATES: authority.serverDirectory },
    });
  }

  /** deploy.sh tel que sur le VPS : seul TRAME_ROOT remplace /opt/trame. */
  function deploy(argument: string): Promise<CommandRun> {
    return runVisibleCommand('bash', [DEPLOY_SCRIPT, argument], {
      environment: {
        PATH: process.env['PATH'] ?? '',
        HOME: process.env['HOME'] ?? workDirectory,
        TRAME_ROOT: root,
        CURL_CA_BUNDLE: authority.certificatePath,
      },
    });
  }

  function recorded(kind: 'current' | 'previous'): string {
    return readFileSync(join(root, 'staging', 'releases', kind), 'utf8').trim();
  }

  function verifiedDigests(commit: string): string {
    return readFileSync(join(root, 'staging', 'releases', `${commit}.env`), 'utf8');
  }

  async function expectDeployed(name: string, run: CommandRun, current: string): Promise<void> {
    report.steps.push({ name, outcome: `code ${String(run.exitCode)}` });
    expect(run.exitCode, run.output).toBe(0);
    expect(recorded('current')).toBe(current);
  }

  async function stopSampler(): Promise<void> {
    if (samplerStopped) {
      return;
    }
    samplerStopped = true;
    const { peaks, failedSamples } = await sampler.stop();
    report.memoryPeaks = peaks;
    report.failedMemorySamples = failedSamples;
  }

  /** Les incidents de tout le parcours, lus une seule fois dans le flux des événements. */
  async function stopContainerEvents(): Promise<void> {
    if (eventsStopped) {
      return;
    }
    eventsStopped = true;
    report.incidents.push(...(await containerEvents.stop(KEYCLOAK_IMAGE)));
  }

  async function containerOfStagingService(service: string): Promise<string> {
    const output = await runCommand('docker', [
      'ps',
      '--quiet',
      '--filter',
      'label=com.docker.compose.project=trame-staging',
      '--filter',
      `label=com.docker.compose.service=${service}`,
    ]);
    return output.trim();
  }

  async function publicStatus(url: string): Promise<string> {
    return runCommand('curl', [
      '--silent',
      '--output',
      '/dev/null',
      '--write-out',
      '%{http_code}',
      '--cacert',
      authority.certificatePath,
      url,
    ]);
  }

  it('déploie la version précédente publiée, vérifiée et contrôlée en HTTPS', async () => {
    const run = await deploy(versions.previous);

    await expectDeployed('Déploiement de la version précédente', run, versions.previous);
  });

  it('déploie la version visée, migrations comprises', async () => {
    const run = await deploy(versions.target);

    await expectDeployed('Déploiement de la version visée', run, versions.target);
    expect(recorded('previous')).toBe(versions.previous);
    report.target = { commit: versions.target, digests: verifiedDigests(versions.target) };
    report.previous = { commit: versions.previous, digests: verifiedDigests(versions.previous) };
  });

  it('revient à la version précédente sur le schéma de la version visée', async () => {
    const run = await deploy('--rollback');

    await expectDeployed('Retour arrière', run, versions.previous);
    expect(recorded('previous')).toBe(versions.target);
  });

  it('remet en service la version visée', async () => {
    const run = await deploy(versions.target);

    await expectDeployed('Remise en service de la version visée', run, versions.target);
  });

  it('ne publie aucun port des conteneurs de Trame sur l’hôte', async () => {
    expect(await publishedPorts()).toEqual({});
  });

  it('n’ouvre de l’extérieur que 80 et 443, par Traefik', async () => {
    const targets: ProbeTarget[] = [];
    for (const port of [80, 443, 3000, 5432, 5672, 8000, 8080, 9000, 15672]) {
      targets.push({ label: `hôte:${String(port)}`, host: 'host.docker.internal', port });
    }
    const services = [
      { label: 'postgres', container: await sharedStack.containerOf('postgres'), ports: [5432] },
      {
        label: 'rabbitmq',
        container: await sharedStack.containerOf('rabbitmq'),
        ports: [5672, 15672],
      },
      {
        label: 'keycloak',
        container: await sharedStack.containerOf('keycloak'),
        ports: [8080, 9000],
      },
      { label: 'api', container: await containerOfStagingService('api'), ports: [3000] },
      { label: 'engine', container: await containerOfStagingService('engine'), ports: [8000] },
    ];
    for (const service of services) {
      for (const address of await containerAddresses(service.container)) {
        for (const port of service.ports) {
          targets.push({ label: `${service.label}:${String(port)}`, host: address, port });
        }
      }
    }

    expect(await reachableFromOutside(KEYCLOAK_IMAGE, targets)).toEqual(['hôte:80', 'hôte:443']);
  });

  it('ne route ni la console ni le realm master, ouverts par le seul tunnel', async () => {
    const keycloak = await sharedStack.containerOf('keycloak');
    const edgeAddress = await runCommand('docker', [
      'inspect',
      '--format',
      '{{(index .NetworkSettings.Networks "edge").IPAddress}}',
      keycloak,
    ]);
    adminTunnel = await openAdminTunnel(ADMIN_TUNNEL_PORT, edgeAddress.trim(), 8080);

    expect((await fetch(`${KEYCLOAK_ADMIN_URL}/admin/master/console/`)).status).toBe(200);
    expect(await publicStatus(`${AUTH_URL}/admin/master/console/`)).toBe('404');
    expect(await publicStatus(`${AUTH_URL}/realms/master/.well-known/openid-configuration`)).toBe(
      '404',
    );
    expect(
      await publicStatus(`${AUTH_URL}/realms/trame-staging/.well-known/openid-configuration`),
    ).toBe('200');
  });

  it('ne tue ni ne redémarre aucun conteneur, et relève la mémoire de chacun', async () => {
    await stopContainerEvents();
    await stopSampler();

    expect(report.incidents).toEqual([]);
    for (const service of ['postgres', 'rabbitmq', 'keycloak']) {
      expect(Object.keys(report.memoryPeaks)).toContain(`trame-shared-${service}-1`);
    }
    for (const service of ['api', 'relay', 'engine', 'worker', 'web']) {
      expect(Object.keys(report.memoryPeaks)).toContain(`trame-staging-${service}-1`);
    }
  });
});
