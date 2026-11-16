import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Livraison continue du staging (US-005, ADR-0035) : la clé de déploiement de GitHub n'ouvre
 * qu'une commande imposée. `trame-deploy-ssh` filtre la demande reçue par SSH, `trame-deploy`
 * la rejoue en root : mise à jour du clone, puis `deploy.sh`, seulement pour un commit de main.
 */
const SSH_SCRIPT = join(__dirname, '../staging/remote/trame-deploy-ssh');
const ROOT_SCRIPT = join(__dirname, '../staging/remote/trame-deploy');

interface Run {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv): Run {
  const result = spawnSync(command, args, { encoding: 'utf8', env });
  return { exitCode: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

function git(directory: string, ...args: string[]): string {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
}

/** Un faux exécutable qui consigne ses arguments, une ligne par appel. */
function recordingTool(directory: string, name: string, record: string): void {
  const path = join(directory, name);
  writeFileSync(path, `#!/usr/bin/env bash\necho "$*" >> '${record}'\n`);
  chmodSync(path, 0o755);
}

describe('commande imposée de la clé de déploiement (trame-deploy-ssh)', () => {
  let workspace: string;
  let record: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'trame-deploy-ssh-'));
    record = join(workspace, 'sudo.log');
    recordingTool(workspace, 'sudo', record);
    env = { PATH: `${workspace}:${process.env['PATH'] ?? ''}` };
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function request(command: string | undefined): Run {
    const requestEnv = command === undefined ? env : { ...env, SSH_ORIGINAL_COMMAND: command };
    return run(SSH_SCRIPT, [], requestEnv);
  }

  function sudoCalls(): string[] {
    try {
      return readFileSync(record, 'utf8').trim().split('\n');
    } catch {
      return [];
    }
  }

  it('transmet un déploiement de commit complet au script root, sans mot de passe', () => {
    const commit = 'a'.repeat(40);

    const result = request(`deploy ${commit}`);

    expect(result.exitCode).toBe(0);
    expect(sudoCalls()).toEqual([`-n /usr/local/sbin/trame-deploy deploy ${commit}`]);
  });

  it('transmet un retour arrière', () => {
    const result = request('rollback');

    expect(result.exitCode).toBe(0);
    expect(sudoCalls()).toEqual(['-n /usr/local/sbin/trame-deploy rollback']);
  });

  it.each([
    ['une session interactive', undefined],
    ['un shell', 'bash'],
    ['un commit abrégé', 'deploy c3f82dd'],
    ['un commit en majuscules', `deploy ${'A'.repeat(40)}`],
    ['une commande ajoutée', `deploy ${'a'.repeat(40)}; id`],
    ['une option de deploy.sh', 'deploy --rollback'],
    ['un retour arrière avec argument', 'rollback now'],
  ])('refuse %s sans rien lancer', (_case, command) => {
    const result = request(command);

    expect(result.exitCode).toBe(64);
    expect(result.stderr).toContain('Commande refusée');
    expect(sudoCalls()).toEqual([]);
  });
});

describe('script root du déploiement (trame-deploy)', () => {
  let workspace: string;
  let root: string;
  let origin: string;
  let record: string;
  let env: NodeJS.ProcessEnv;

  /** Un clone /opt/trame/source dont l'origine a une branche main, et un faux deploy.sh. */
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'trame-deploy-'));
    origin = join(workspace, 'origin');
    root = join(workspace, 'opt-trame');
    record = join(workspace, 'deploy.log');
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', origin]);
    git(origin, 'config', 'user.email', 'test@example.invalid');
    git(origin, 'config', 'user.name', 'Test');
    commitDeployScript('A');
    execFileSync('git', ['clone', '--quiet', origin, join(root, 'source')]);
    env = { PATH: process.env['PATH'] ?? '', TRAME_ROOT: root };
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  /** Chaque version de main porte un deploy.sh qui consigne sa version et ses arguments. */
  function commitDeployScript(label: string): string {
    const script = join(origin, 'infra', 'staging', 'deploy.sh');
    execFileSync('mkdir', ['-p', join(origin, 'infra', 'staging')]);
    writeFileSync(script, `#!/usr/bin/env bash\necho "${label} $*" >> '${record}'\n`);
    chmodSync(script, 0o755);
    git(origin, 'add', '.');
    git(origin, 'commit', '--quiet', '-m', `version ${label}`);
    return git(origin, 'rev-parse', 'HEAD');
  }

  function deployCalls(): string[] {
    try {
      return readFileSync(record, 'utf8').trim().split('\n');
    } catch {
      return [];
    }
  }

  it('met le clone sur un commit récent de main, puis lance son deploy.sh', () => {
    const commit = commitDeployScript('B');

    const result = run(ROOT_SCRIPT, ['deploy', commit], env);

    expect(result.exitCode).toBe(0);
    expect(git(join(root, 'source'), 'rev-parse', 'HEAD')).toBe(commit);
    expect(deployCalls()).toEqual([`B ${commit}`]);
  });

  it('refuse un commit absent de main, sans toucher au clone', () => {
    const before = git(join(root, 'source'), 'rev-parse', 'HEAD');
    git(origin, 'checkout', '--quiet', '-b', 'branche-non-fusionnee');
    const foreign = commitDeployScript('X');
    git(origin, 'checkout', '--quiet', 'main');

    const result = run(ROOT_SCRIPT, ['deploy', foreign], env);

    expect(result.exitCode).toBe(65);
    expect(result.stderr).toContain('absent de main');
    expect(git(join(root, 'source'), 'rev-parse', 'HEAD')).toBe(before);
    expect(deployCalls()).toEqual([]);
  });

  it('revient à la version précédente avec le deploy.sh en place', () => {
    const result = run(ROOT_SCRIPT, ['rollback'], env);

    expect(result.exitCode).toBe(0);
    expect(deployCalls()).toEqual(['A --rollback']);
  });

  it.each([
    ['aucun argument', []],
    ['une action inconnue', ['shell']],
    ['un commit abrégé', ['deploy', 'c3f82dd']],
    ['un argument en trop', ['deploy', 'a'.repeat(40), '--rollback']],
    ['un retour arrière avec argument', ['rollback', 'a'.repeat(40)]],
  ])('refuse %s', (_case, args) => {
    const result = run(ROOT_SCRIPT, args, env);

    expect(result.exitCode).toBe(64);
    expect(deployCalls()).toEqual([]);
  });
});

describe('envoi depuis GitHub (ci-ssh.sh)', () => {
  const CI_SCRIPT = join(__dirname, '../staging/remote/ci-ssh.sh');
  let workspace: string;
  let record: string;
  let env: NodeJS.ProcessEnv;

  /** Un faux ssh qui consigne ses options, la demande, et les droits de la clé reçue. */
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'trame-ci-ssh-'));
    record = join(workspace, 'ssh.log');
    const fakeSsh = join(workspace, 'ssh');
    writeFileSync(
      fakeSsh,
      [
        '#!/usr/bin/env bash',
        `printf '%s\\n' "$@" >> '${record}'`,
        `stat -c 'key-mode=%a' "$2" >> '${record}'`,
        'exit 3',
      ].join('\n'),
    );
    chmodSync(fakeSsh, 0o755);
    env = {
      PATH: `${workspace}:${process.env['PATH'] ?? ''}`,
      DEPLOY_KEY: 'clé-privée-de-test',
      KNOWN_HOSTS: 'staging.trame.wkhach.dev ssh-ed25519 AAAA-test',
    };
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('épingle l’empreinte du VPS, refuse toute question et rend le code de deploy.sh', () => {
    const result = run(CI_SCRIPT, [`deploy ${'b'.repeat(40)}`], env);

    expect(result.exitCode).toBe(3);
    const call = readFileSync(record, 'utf8');
    expect(call).toContain('StrictHostKeyChecking=yes');
    expect(call).toContain('BatchMode=yes');
    expect(call).toContain('IdentitiesOnly=yes');
    expect(call).toContain('trame-deploy@staging.trame.wkhach.dev');
    expect(call).toContain(`deploy ${'b'.repeat(40)}`);
    expect(call).toContain('key-mode=600');
  });

  it.each([
    ['sans clé', 'DEPLOY_KEY'],
    ['sans empreinte du VPS', 'KNOWN_HOSTS'],
  ])('refuse de se connecter %s', (_case, missing) => {
    const result = run(CI_SCRIPT, ['rollback'], { ...env, [missing]: '' });

    expect(result.exitCode).not.toBe(0);
    expect(() => readFileSync(record, 'utf8')).toThrow();
  });
});
