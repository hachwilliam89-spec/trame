import { type ChildProcess, execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

const DEPLOY_SCRIPT = join(__dirname, '../../staging/deploy.sh');
const FAKE_TOOLS = join(__dirname, '../fixtures/staging-host');
const IMAGE_NAMES = ['api', 'relay', 'migrator', 'web', 'engine', 'worker'];

export const PUBLIC_URL = 'https://staging.trame.wkhach.dev';
export const EXPECTED_ISSUER = 'https://auth.trame.wkhach.dev/realms/trame-staging';
export const OPENID_CONFIGURATION = `${EXPECTED_ISSUER}/.well-known/openid-configuration`;

export type PublicResponse =
  { status: number; contentType: string; body?: string } | { connectionError: string };

export interface DeployRun {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Les digests qu'un appel à Docker Compose interpolerait, par variable. */
export interface InterpolatedDigests {
  subcommand: string;
  digests: Record<string, string>;
}

/** Un appel à `docker compose`, découpé en options globales, sous-commande et arguments. */
export interface ComposeCall {
  project: string;
  envFile: string | undefined;
  file: string | undefined;
  subcommand: string;
  arguments: string[];
}

/**
 * Le VPS vu par `infra/staging/deploy.sh`, dans un dossier temporaire : un clone git réel d'une
 * origine locale, et de faux `docker`, `oras`, `cosign`, `curl` et `sleep` placés devant les vrais
 * dans le PATH (infra/src/fixtures/staging-host). Les faux outils notent chaque appel.
 */
export class FakeStagingHost {
  private readonly directory = mkdtempSync(join(tmpdir(), 'staging-host-'));
  /** Le dossier qui tient lieu de /opt/trame. */
  readonly root = join(this.directory, 'trame');
  private readonly state = join(this.directory, 'state');
  private readonly origin = join(this.directory, 'origin');
  private readonly home = join(this.directory, 'home');
  private readonly fakeTools = join(this.directory, 'bin');
  private readonly missingTools: string[] = [];
  private shellVariables: Record<string, string> = {};

  constructor() {
    mkdirSync(join(this.root, 'staging', 'secrets'), { recursive: true });
    mkdirSync(join(this.state, 'docker'), { recursive: true });
    mkdirSync(join(this.state, 'releases'));
    mkdirSync(this.home);
    mkdirSync(this.fakeTools);
    for (const tool of readdirSync(FAKE_TOOLS)) {
      symlinkSync(join(FAKE_TOOLS, tool), join(this.fakeTools, tool));
    }
    this.git(this.directory, 'init', '--quiet', '--initial-branch', 'main', this.origin);
    this.commitVersion('initiale');
    this.git(this.directory, 'clone', '--quiet', this.origin, join(this.root, 'source'));
    this.servesHealthyPublicAddress();
  }

  /** Un nouveau commit de main sur l'origine, avec son propre fichier Compose du staging. */
  commitVersion(label: string): string {
    const composeFile = join(this.origin, 'infra', 'compose', 'staging.yml');
    mkdirSync(dirname(composeFile), { recursive: true });
    writeFileSync(composeFile, composeFileContent(label));
    this.git(this.origin, 'add', '.');
    this.git(this.origin, 'commit', '--quiet', '--message', `version ${label}`);
    return this.git(this.origin, 'rev-parse', 'HEAD').trim();
  }

  /** Un commit de main sans fichier Compose du staging, comme ceux qui ont précédé l'étape 3a. */
  commitWithoutStagingCompose(label: string): string {
    this.git(this.origin, 'rm', '--quiet', join('infra', 'compose', 'staging.yml'));
    this.git(this.origin, 'commit', '--quiet', '--message', `version ${label}`);
    return this.git(this.origin, 'rev-parse', 'HEAD').trim();
  }

  makeOriginUnreachable(): this {
    renameSync(this.origin, `${this.origin}-introuvable`);
    return this;
  }

  /** Un nouveau commit de main, publié : manifeste de version et six images signés. */
  publishedVersion(label: string): string {
    const commit = this.commitVersion(label);
    this.publish(commit);
    return commit;
  }

  publish(commit: string): this {
    const images = IMAGE_NAMES.map((name) => ({
      name,
      reference: this.imageReference(commit, name),
    }));
    writeFileSync(
      join(this.state, 'releases', `${commit}.json`),
      JSON.stringify({ commit, images }),
    );
    return this;
  }

  imageReference(commit: string, name: string): string {
    return `ghcr.io/hachwilliam89-spec/trame-${name}@${this.imageDigest(commit, name)}`;
  }

  imageDigest(commit: string, name: string): string {
    return `sha256:${createHash('sha256').update(`${name} ${commit}`).digest('hex')}`;
  }

  refusesSignatureOf(reference: string): this {
    writeFileSync(join(this.state, 'refused-signatures'), `${reference}\n`, { flag: 'a' });
    return this;
  }

  failsToPull(message: string): this {
    return this.dockerFails('pull-error', message);
  }

  failsToBackUp(message: string): this {
    return this.dockerFails('dump-error', message);
  }

  failsToMigrate(message: string): this {
    return this.dockerFails('migration-error', message);
  }

  hasNoSharedPostgres(): this {
    writeFileSync(join(this.state, 'docker', 'no-postgres'), '');
    return this;
  }

  /** Retire un faux outil, et le vrai du PATH s'il est installé sur le poste. */
  withoutTool(tool: 'oras' | 'cosign'): this {
    rmSync(join(this.fakeTools, tool));
    this.missingTools.push(tool);
    return this;
  }

  /** L'API de cette version ne devient jamais saine : `docker compose up --wait` échoue. */
  apiNeverHealthyIn(commit: string): this {
    const digest = this.imageDigest(commit, 'api');
    writeFileSync(join(this.state, 'docker', 'unhealthy-api-digests'), `${digest}\n`, {
      flag: 'a',
    });
    return this;
  }

  /** Les réponses successives d'une adresse publique ; la dernière se répète. */
  publicAddressResponds(url: string, ...responses: PublicResponse[]): this {
    const directory = join(this.state, 'curl', url.replace(/[^A-Za-z0-9]/g, '_'));
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
    for (const [index, response] of responses.entries()) {
      writeFileSync(join(directory, String(index + 1)), responseText(response));
    }
    writeFileSync(join(directory, 'count'), String(responses.length));
    return this;
  }

  /** Des variables du shell qui lance le script, comme un `export` oublié par l'administrateur. */
  inShell(variables: Record<string, string>): this {
    this.shellVariables = variables;
    return this;
  }

  /** Les six variables TRAME_<IMAGE>_DIGEST d'une version publiée. */
  digestVariables(commit: string): Record<string, string> {
    const variables: Record<string, string> = {};
    for (const name of IMAGE_NAMES) {
      variables[`TRAME_${name.toUpperCase()}_DIGEST`] = this.imageDigest(commit, name);
    }
    return variables;
  }

  deploy(...args: string[]): DeployRun {
    const result = spawnSync('bash', [DEPLOY_SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...this.shellVariables, ...this.scriptEnvironment() },
      timeout: 60_000,
    });
    return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  /** Prend le verrou des déploiements, comme le ferait un déploiement en cours. */
  async holdDeployLock(): Promise<() => void> {
    const holder: ChildProcess = spawn(
      'python3',
      [
        '-I',
        '-c',
        'import fcntl, sys, time\n' +
          'lock = open(sys.argv[1], "a")\n' +
          'fcntl.flock(lock, fcntl.LOCK_EX)\n' +
          'print("verrou pris", flush=True)\n' +
          'time.sleep(60)',
        join(this.root, 'staging', 'deploy.lock'),
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    await new Promise<void>((resolve) => holder.stdout?.once('data', () => resolve()));
    return () => holder.kill();
  }

  /** La version notée en service, ou la précédente ; undefined si aucune. */
  recordedVersion(kind: 'current' | 'previous'): string | undefined {
    const file = this.releasesPath(kind);
    if (!existsSync(file)) {
      return undefined;
    }
    return readFileSync(file, 'utf8').trim();
  }

  releasesPath(...segments: string[]): string {
    return join(this.root, 'staging', 'releases', ...segments);
  }

  backups(): string[] {
    const directory = join(this.root, 'staging', 'backups');
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory).map((name) => join(directory, name));
  }

  /** Les appels reçus par les faux outils, chacun sous la forme [outil, ...arguments]. */
  calls(tool?: string): string[][] {
    const callsFile = join(this.state, 'calls');
    if (!existsSync(callsFile)) {
      return [];
    }
    const lines = readFileSync(callsFile, 'utf8')
      .split('\n')
      .filter((line) => line !== '');
    const calls = lines.map((line) => line.replace(/\t$/, '').split('\t'));
    if (tool === undefined) {
      return calls;
    }
    return calls.filter((call) => call[0] === tool);
  }

  composeCalls(): ComposeCall[] {
    const composeCalls: ComposeCall[] = [];
    for (const call of this.calls('docker')) {
      if (call[1] === 'compose') {
        composeCalls.push(parseComposeCall(call.slice(2)));
      }
    }
    return composeCalls;
  }

  interpolatedDigests(): InterpolatedDigests[] {
    const file = join(this.state, 'compose-digests');
    if (!existsSync(file)) {
      return [];
    }
    const interpolations: InterpolatedDigests[] = [];
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line === '') {
        continue;
      }
      const [subcommand = '', ...assignments] = line.split('\t');
      const digests: Record<string, string> = {};
      for (const assignment of assignments) {
        const [variable = '', value = ''] = assignment.split('=');
        digests[variable] = value;
      }
      interpolations.push({ subcommand, digests });
    }
    return interpolations;
  }

  /** Oublie les appels déjà notés, par exemple ceux des déploiements qui préparent un test. */
  forgetCalls(): void {
    rmSync(join(this.state, 'calls'), { force: true });
    rmSync(join(this.state, 'compose-digests'), { force: true });
  }

  dispose(): void {
    rmSync(this.directory, { recursive: true, force: true });
  }

  private servesHealthyPublicAddress(): void {
    this.publicAddressResponds(`${PUBLIC_URL}/health`, { status: 200, contentType: 'text/plain' });
    this.publicAddressResponds(`${PUBLIC_URL}/api/v1/health/ready`, {
      status: 200,
      contentType: 'application/json; charset=utf-8',
    });
    this.publicAddressResponds(`${PUBLIC_URL}/api/v1/sites`, {
      status: 401,
      contentType: 'application/problem+json; charset=utf-8',
    });
    this.publicAddressResponds(OPENID_CONFIGURATION, {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ issuer: EXPECTED_ISSUER }),
    });
  }

  private dockerFails(failure: string, message: string): this {
    writeFileSync(join(this.state, 'docker', failure), `${message}\n`);
    return this;
  }

  private scriptEnvironment(): NodeJS.ProcessEnv {
    return {
      PATH: this.searchPath(),
      FAKE_STATE: this.state,
      TRAME_ROOT: this.root,
      HOME: this.home,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    };
  }

  /**
   * Les faux outils d'abord. Un outil retiré par withoutTool l'est aussi du système : chaque
   * dossier du PATH qui en contient un vrai est écarté.
   */
  private searchPath(): string {
    const kept = [this.fakeTools];
    for (const directory of (process.env['PATH'] ?? '').split(delimiter)) {
      const hasMissingTool = this.missingTools.some((tool) => existsSync(join(directory, tool)));
      if (directory !== '' && !hasMissingTool) {
        kept.push(directory);
      }
    }
    return kept.join(delimiter);
  }

  private git(directory: string, ...args: string[]): string {
    const identity = ['-c', 'user.name=Trame', '-c', 'user.email=trame@example.invalid'];
    return execFileSync('git', [...identity, '-c', 'commit.gpgsign=false', ...args], {
      cwd: directory,
      encoding: 'utf8',
      env: this.scriptEnvironment(),
    });
  }
}

export function composeFileContent(label: string): string {
  return `# Compose du staging, version ${label}\n`;
}

function responseText(response: PublicResponse): string {
  if ('connectionError' in response) {
    return `erreur ${response.connectionError}\n`;
  }
  return `${response.status} ${response.contentType}\n${response.body ?? ''}`;
}

const COMPOSE_OPTIONS_WITH_VALUE = ['--project-name', '--env-file', '--file'];

function parseComposeCall(args: string[]): ComposeCall {
  const options: Record<string, string> = {};
  let index = 0;
  while (index < args.length && COMPOSE_OPTIONS_WITH_VALUE.includes(args[index] ?? '')) {
    options[args[index] ?? ''] = args[index + 1] ?? '';
    index += 2;
  }
  return {
    project: options['--project-name'] ?? '',
    envFile: options['--env-file'],
    file: options['--file'],
    subcommand: args[index] ?? '',
    arguments: args.slice(index + 1),
  };
}
