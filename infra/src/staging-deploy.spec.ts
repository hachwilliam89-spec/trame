import { appendFileSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import {
  EXPECTED_ISSUER,
  FakeStagingHost,
  OPENID_CONFIGURATION,
  PUBLIC_URL,
  composeFileContent,
} from './lib/fake-staging-host';

/**
 * Déploiement du staging par `infra/staging/deploy.sh` (US-005 B2a, étape 3b, #47), joué avec un
 * vrai git et un vrai vérificateur de version, mais de faux docker, oras, cosign et curl.
 */
const RUNNING_SERVICES = ['api', 'relay', 'engine', 'worker', 'web'];

describe('déploiement du staging (deploy.sh)', () => {
  let host: FakeStagingHost;

  beforeEach(() => {
    host = new FakeStagingHost();
  });

  afterEach(() => {
    host.dispose();
  });

  function subcommands(): string[] {
    return host.composeCalls().map((call) => call.subcommand);
  }

  function upCalls() {
    return host.composeCalls().filter((call) => call.subcommand === 'up');
  }

  describe('Déploiement d’une version vérifiée', () => {
    it('vérifie, précharge, sauvegarde, migre, puis bascule les services sur les digests vérifiés', () => {
      const commit = host.publishedVersion('A');

      const run = host.deploy(commit);

      expect(run.stderr).toBe('');
      expect(run.exitCode).toBe(0);
      expect(subcommands()).toEqual(['pull', 'run', 'up']);
      const dockerCommands = host.calls('docker').map((call) => call[1]);
      expect(dockerCommands).toEqual(['compose', 'ps', 'exec', 'compose', 'compose']);

      for (const call of host.composeCalls()) {
        expect(call.project).toBe('trame-staging');
        expect(call.envFile).toBe(host.releasesPath(`${commit}.env`));
        expect(call.file).toBe(host.releasesPath(commit, 'infra', 'compose', 'staging.yml'));
      }
      expect(
        readFileSync(host.releasesPath(commit, 'infra', 'compose', 'staging.yml'), 'utf8'),
      ).toBe(composeFileContent('A'));
      const digests = readFileSync(host.releasesPath(`${commit}.env`), 'utf8')
        .trim()
        .split('\n');
      const expectedDigests = ['api', 'relay', 'migrator', 'web', 'engine', 'worker'].map(
        (name) => `TRAME_${name.toUpperCase()}_DIGEST=${host.imageDigest(commit, name)}`,
      );
      expect(digests.sort()).toEqual(expectedDigests.sort());
    });

    it('migre avec le seul migrator, puis attend en 60 secondes les sondes des autres services', () => {
      const commit = host.publishedVersion('A');

      host.deploy(commit);

      const [migration, switchover] = host.composeCalls().slice(1);
      expect(migration?.arguments).toEqual(['--rm', '--no-deps', 'migrator']);
      expect(switchover?.arguments).toEqual([
        '--detach',
        '--wait',
        '--wait-timeout',
        '60',
        '--no-deps',
        '--remove-orphans',
        ...RUNNING_SERVICES,
      ]);
    });

    it('sauvegarde trame_staging avant la migration, dans un fichier lisible par root seul', () => {
      const commit = host.publishedVersion('A');

      host.deploy(commit);

      const [backup] = host.backups();
      expect(host.backups()).toHaveLength(1);
      expect(backup).toMatch(
        new RegExp(`/trame_staging-\\d{8}T\\d{6}Z-avant-${commit.slice(0, 12)}\\.dump$`),
      );
      expect(readFileSync(backup ?? '', 'utf8')).toBe('sauvegarde de trame_staging\n');
      expect(statSync(backup ?? '').mode & 0o777).toBe(0o600);
      const dump = host.calls('docker').find((call) => call[1] === 'exec');
      expect(dump).toEqual([
        'docker',
        'exec',
        'trame-shared-postgres',
        'pg_dump',
        '--username',
        'postgres',
        '--dbname',
        'trame_staging',
        '--format',
        'custom',
      ]);
    });

    it('contrôle l’adresse publique : front, API prête, route protégée et émetteur exact', () => {
      const commit = host.publishedVersion('A');

      host.deploy(commit);

      const urls = host.calls('curl').map((call) => call[call.length - 1]);
      expect(urls).toEqual([
        `${PUBLIC_URL}/health`,
        `${PUBLIC_URL}/api/v1/health/ready`,
        `${PUBLIC_URL}/api/v1/sites`,
        OPENID_CONFIGURATION,
      ]);
    });

    it('note la version en service, puis la précédente au déploiement suivant', () => {
      const first = host.publishedVersion('A');
      host.deploy(first);
      expect(host.recordedVersion('current')).toBe(first);
      expect(host.recordedVersion('previous')).toBeUndefined();

      const second = host.publishedVersion('B');
      const run = host.deploy(second);

      expect(run.exitCode).toBe(0);
      expect(host.recordedVersion('current')).toBe(second);
      expect(host.recordedVersion('previous')).toBe(first);
    });
  });

  describe('Un seul déploiement à la fois', () => {
    it('s’arrête sans rien vérifier ni toucher pendant un autre déploiement', async () => {
      const commit = host.publishedVersion('A');
      const releaseLock = await host.holdDeployLock();

      try {
        const run = host.deploy(commit);

        expect(run.exitCode).toBe(3);
        expect(run.stderr).toContain('un autre déploiement est en cours');
        expect(host.calls()).toEqual([]);
        expect(host.recordedVersion('current')).toBeUndefined();
      } finally {
        releaseLock();
      }
    });

    it('déploie une fois le verrou rendu', async () => {
      const commit = host.publishedVersion('A');
      const releaseLock = await host.holdDeployLock();
      host.deploy(commit);
      releaseLock();

      await vi.waitFor(() => expect(host.deploy(commit).exitCode).toBe(0));
    });
  });

  describe('Échec avant la bascule : les services restent sur la version en service', () => {
    let inService: string;
    let next: string;

    beforeEach(() => {
      inService = host.publishedVersion('A');
      host.deploy(inService);
      next = host.publishedVersion('B');
      host.forgetCalls();
    });

    function expectServicesUntouched(): void {
      expect(subcommands()).not.toContain('up');
      expect(subcommands()).not.toContain('stop');
      expect(host.recordedVersion('current')).toBe(inService);
    }

    it('s’arrête sur une image introuvable, sans sauvegarde ni migration', () => {
      host.failsToPull('manifest unknown: ghcr.io/hachwilliam89-spec/trame-engine');

      const run = host.deploy(next);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain('manifest unknown: ghcr.io/hachwilliam89-spec/trame-engine');
      expect(run.stderr).toContain(`Préchargement des images de ${next} en échec`);
      expect(subcommands()).toEqual(['pull']);
      expect(host.calls('docker').map((call) => call[1])).not.toContain('exec');
      expectServicesUntouched();
    });

    it('ne migre pas sans sauvegarde', () => {
      host.failsToBackUp('pg_dump: error: connection to server failed');

      const run = host.deploy(next);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain('Sauvegarde de trame_staging en échec');
      expect(subcommands()).toEqual(['pull']);
      expect(host.backups()).toHaveLength(1);
      expectServicesUntouched();
    });

    it('ne migre pas quand PostgreSQL de la stack partagée est introuvable', () => {
      host.hasNoSharedPostgres();

      const run = host.deploy(next);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain('PostgreSQL de trame-shared introuvable');
      expect(subcommands()).toEqual(['pull']);
      expectServicesUntouched();
    });

    it('garde la version en service quand la migration échoue, et sa sauvegarde', () => {
      host.failsToMigrate('Error: P3018 A migration failed to apply.');

      const run = host.deploy(next);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain('P3018 A migration failed to apply.');
      expect(run.stderr).toContain(`Migration vers ${next} en échec`);
      expect(subcommands()).toEqual(['pull', 'run']);
      expect(host.backups()).toHaveLength(2);
      expectServicesUntouched();
    });
  });

  describe('Échec de la bascule : retour au point de restauration de la tentative', () => {
    let older: string;
    let inService: string;
    let next: string;

    beforeEach(() => {
      older = host.publishedVersion('A');
      host.deploy(older);
      inService = host.publishedVersion('B');
      host.deploy(inService);
      next = host.publishedVersion('C');
      host.forgetCalls();
    });

    function versionOf(call: { envFile: string | undefined }): string | undefined {
      for (const version of [older, inService, next]) {
        if (call.envFile === host.releasesPath(`${version}.env`)) {
          return version;
        }
      }
      return undefined;
    }

    function startedVersions(): (string | undefined)[] {
      return upCalls().map((call) => versionOf(call));
    }

    it('redéploie la version en service, et non la précédente, quand l’API ne devient pas saine', () => {
      host.apiNeverHealthyIn(next);

      const run = host.deploy(next);

      expect(run.exitCode).toBe(1);
      expect(startedVersions()).toEqual([next, inService]);
      const restore = upCalls()[1];
      expect(restore?.file).toBe(host.releasesPath(inService, 'infra', 'compose', 'staging.yml'));
      expect(restore?.arguments).toEqual(upCalls()[0]?.arguments);
      expect(host.recordedVersion('current')).toBe(inService);
      expect(host.recordedVersion('previous')).toBe(older);
    });

    it('nomme le service en échec et garde ses journaux, que le retour efface', () => {
      host.apiNeverHealthyIn(next);

      const run = host.deploy(next);

      expect(run.stderr).toContain(`Bascule vers ${next} en échec : api (running, unhealthy)`);
      expect(run.stderr).toContain(`${inService} de nouveau en service`);
      const failureLog = host.releasesPath(`${next}.failure.log`);
      expect(run.stderr).toContain(failureLog);
      expect(readFileSync(failureLog, 'utf8')).toBe('journaux des services du staging\n');
      const logsCall = host.composeCalls().find((call) => call.subcommand === 'logs');
      expect(versionOf(logsCall ?? { envFile: undefined })).toBe(next);
    });

    it('redéploie la version en service quand l’adresse publique ne répond pas', () => {
      host.publicAddressResponds(`${PUBLIC_URL}/health`, {
        status: 502,
        contentType: 'text/plain',
      });

      const run = host.deploy(next);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain(`${PUBLIC_URL}/health répond 502, 200 attendu.`);
      expect(startedVersions()).toEqual([next, inService]);
      expect(host.recordedVersion('current')).toBe(inService);
    });

    it('répète les contrôles externes toutes les 2 secondes, pendant 60 secondes', () => {
      host.publicAddressRespondsWhileServing(next, `${PUBLIC_URL}/health`, {
        status: 502,
        contentType: 'text/plain',
      });

      host.deploy(next);

      const healthChecks = host
        .calls('curl')
        .filter((call) => call.at(-1) === `${PUBLIC_URL}/health`);
      expect(healthChecks.length).toBeGreaterThanOrEqual(30);
      expect(host.calls('sleep')).toHaveLength(29);
      expect(host.elapsedSeconds()).toBe(58);
    });

    it('borne l’attente à 60 secondes, temps des requêtes compris', () => {
      host.publicAddressRespondsWhileServing(next, `${PUBLIC_URL}/health`, {
        status: 502,
        contentType: 'text/plain',
        seconds: 7,
      });

      const run = host.deploy(next);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain('en échec pendant 60 secondes');
      // Six essais de 7 secondes, chacun suivi de 2 secondes de pause, puis un dernier essai borné
      // aux 6 secondes restantes.
      const maxTimes = host
        .calls('curl')
        .filter((call) => call.at(-1) === `${PUBLIC_URL}/health`)
        .map((call) => call[call.indexOf('--max-time') + 1]);
      expect(maxTimes.slice(0, 7)).toEqual([...Array<string>(6).fill('10.000'), '6.000']);
      expect(host.elapsedSeconds()).toBe(60);
    });

    it('déploie quand l’adresse publique répond après un délai, le temps du certificat', () => {
      host.publicAddressResponds(
        `${PUBLIC_URL}/health`,
        { connectionError: 'SSL certificate problem: self-signed certificate' },
        { status: 404, contentType: 'text/plain' },
        { status: 200, contentType: 'text/plain' },
      );

      const run = host.deploy(next);

      expect(run.exitCode).toBe(0);
      expect(host.calls('sleep')).toHaveLength(2);
      expect(host.recordedVersion('current')).toBe(next);
      expect(host.recordedVersion('previous')).toBe(inService);
    });

    it.each([
      {
        failure: 'une API injoignable',
        url: `${PUBLIC_URL}/api/v1/health/ready`,
        response: { connectionError: 'Connection reset by peer' },
        reason: `${PUBLIC_URL}/api/v1/health/ready injoignable : curl: (35) Connection reset by peer`,
      },
      {
        failure: 'une route protégée qui répond sans problem+json',
        url: `${PUBLIC_URL}/api/v1/sites`,
        response: { status: 401, contentType: 'text/html' },
        reason: `${PUBLIC_URL}/api/v1/sites répond en text/html, application/problem+json attendu.`,
      },
      {
        failure: 'une route protégée ouverte sans jeton',
        url: `${PUBLIC_URL}/api/v1/sites`,
        response: { status: 200, contentType: 'application/json' },
        reason: `${PUBLIC_URL}/api/v1/sites répond 200, 401 attendu.`,
      },
      {
        failure: 'un autre émetteur',
        url: OPENID_CONFIGURATION,
        response: {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ issuer: 'http://localhost:8080/realms/trame-staging' }),
        },
        reason: `Émetteur annoncé : http://localhost:8080/realms/trame-staging, ${EXPECTED_ISSUER} attendu.`,
      },
      {
        failure: 'une configuration OpenID illisible',
        url: OPENID_CONFIGURATION,
        response: { status: 200, contentType: 'application/json', body: '<html>' },
        reason: `Émetteur annoncé : absent, ${EXPECTED_ISSUER} attendu.`,
      },
    ])('nomme le contrôle externe en échec : $failure', ({ url, response, reason }) => {
      host.publicAddressResponds(url, response);

      const run = host.deploy(next);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain(reason);
      expect(host.recordedVersion('current')).toBe(inService);
    });

    it('demande une intervention quand le retour échoue aussi, et le signale au déploiement suivant', () => {
      host.apiNeverHealthyIn(next).apiNeverHealthyIn(inService);

      const run = host.deploy(next);

      expect(run.exitCode).toBe(4);
      expect(run.stderr).toContain(`Retour à ${inService} en échec : api (running, unhealthy)`);
      expect(run.stderr).toContain('Intervention requise');
      expect(host.recordedVersion('current')).toBe(inService);

      const nextRun = host.deploy(host.publishedVersion('D'));
      expect(nextRun.stderr).toContain(
        `Une bascule précédente s'est interrompue (point de restauration : ${inService})`,
      );
    });
  });

  describe('Premier déploiement en échec', () => {
    it('n’arrête que les services du staging, sans toucher aux volumes ni à la stack partagée', () => {
      const commit = host.publishedVersion('A');
      host.apiNeverHealthyIn(commit);

      const run = host.deploy(commit);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain(
        'Premier déploiement en échec : services du staging arrêtés. Volumes, données et stack partagée intacts.',
      );
      expect(subcommands()).toEqual(['pull', 'run', 'up', 'ps', 'logs', 'stop']);
      const stop = host.composeCalls().at(-1);
      expect(stop).toMatchObject({ project: 'trame-staging', arguments: [] });
      for (const call of host.composeCalls()) {
        expect(call.project).toBe('trame-staging');
      }
      expect(host.recordedVersion('current')).toBeUndefined();
    });
  });

  describe('Digests vérifiés prioritaires sur ceux du shell', () => {
    let older: string;
    let inService: string;
    let next: string;

    beforeEach(() => {
      older = host.publishedVersion('A');
      host.deploy(older);
      inService = host.publishedVersion('B');
      host.deploy(inService);
      next = host.publishedVersion('C');
      host.forgetCalls();
      // D'anciens digests exportés dans le shell : Compose les préférerait à ceux de --env-file.
      host.inShell(host.digestVariables(older));
    });

    function interpolatedBy(subcommand: string) {
      return host
        .interpolatedDigests()
        .filter((interpolation) => interpolation.subcommand === subcommand)
        .map((interpolation) => interpolation.digests);
    }

    it('interpole les digests vérifiés à chaque appel Compose', () => {
      const run = host.deploy(next);

      expect(run.exitCode).toBe(0);
      expect(host.interpolatedDigests().map((call) => call.subcommand)).toEqual([
        'pull',
        'run',
        'up',
      ]);
      for (const interpolation of host.interpolatedDigests()) {
        expect(interpolation.digests).toEqual(host.digestVariables(next));
      }
    });

    it('interpole ceux de la version en service au retour', () => {
      host.apiNeverHealthyIn(next);

      host.deploy(next);

      expect(interpolatedBy('up')).toEqual([
        host.digestVariables(next),
        host.digestVariables(inService),
      ]);
      for (const subcommand of ['ps', 'logs']) {
        expect(interpolatedBy(subcommand)).toEqual([host.digestVariables(next)]);
      }
    });

    it('interpole ceux de la version précédente au retour arrière volontaire', () => {
      host.inShell(host.digestVariables(next));

      host.deploy('--rollback');

      expect(interpolatedBy('up')).toEqual([host.digestVariables(older)]);
    });
  });

  describe('Retour arrière volontaire (--rollback)', () => {
    let previous: string;
    let inService: string;

    beforeEach(() => {
      previous = host.publishedVersion('A');
      host.deploy(previous);
      inService = host.publishedVersion('B');
      host.deploy(inService);
      host.forgetCalls();
    });

    it('redéploie la version précédente, de nouveau vérifiée, sur le schéma déjà migré', () => {
      const run = host.deploy('--rollback');

      expect(run.stderr).toBe('');
      expect(run.exitCode).toBe(0);
      expect(host.calls('oras')[0]).toEqual([
        'oras',
        'resolve',
        `ghcr.io/hachwilliam89-spec/trame-release:${previous}`,
      ]);
      expect(subcommands()).toEqual(['pull', 'up']);
      expect(host.calls('docker').map((call) => call[1])).not.toContain('exec');
      expect(upCalls()[0]?.envFile).toBe(host.releasesPath(`${previous}.env`));
      expect(host.recordedVersion('current')).toBe(previous);
      expect(host.recordedVersion('previous')).toBe(inService);
    });

    it('refuse une version précédente qui ne se vérifie plus, sans rien toucher', () => {
      host.refusesSignatureOf(host.imageReference(previous, 'api'));

      const run = host.deploy('--rollback');

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain('Signature refusée pour api');
      expect(host.calls('docker')).toEqual([]);
      expect(host.recordedVersion('current')).toBe(inService);
    });

    it('revient à la version en service si la précédente ne démarre pas', () => {
      host.apiNeverHealthyIn(previous);

      const run = host.deploy('--rollback');

      expect(run.exitCode).toBe(1);
      expect(upCalls().map((call) => call.envFile)).toEqual([
        host.releasesPath(`${previous}.env`),
        host.releasesPath(`${inService}.env`),
      ]);
      expect(host.recordedVersion('current')).toBe(inService);
      expect(host.recordedVersion('previous')).toBe(previous);
    });

    it('refuse le retour arrière sans version précédente', () => {
      const lone = new FakeStagingHost();
      try {
        lone.deploy(lone.publishedVersion('A'));
        lone.forgetCalls();

        const run = lone.deploy('--rollback');

        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain('Aucune version précédente');
        expect(lone.calls()).toEqual([]);
      } finally {
        lone.dispose();
      }
    });
  });

  describe('Points de restauration', () => {
    it('garde la version précédente quand on redéploie la version en service', () => {
      const previous = host.publishedVersion('A');
      host.deploy(previous);
      const inService = host.publishedVersion('B');
      host.deploy(inService);

      const run = host.deploy(inService);

      expect(run.exitCode).toBe(0);
      expect(host.recordedVersion('current')).toBe(inService);
      expect(host.recordedVersion('previous')).toBe(previous);
    });

    it('ne commence pas sans les fichiers de la version en service, nécessaires à un retour', () => {
      const inService = host.publishedVersion('A');
      host.deploy(inService);
      rmSync(host.releasesPath(`${inService}.env`));
      host.forgetCalls();

      const run = host.deploy(host.publishedVersion('B'));

      expect(run.exitCode).toBe(3);
      expect(run.stderr).toContain(`point de restauration ${inService} incomplet`);
      expect(host.calls()).toEqual([]);
    });

    it('ne commence pas quand les digests de la version en service sont ambigus', () => {
      const inService = host.publishedVersion('A');
      host.deploy(inService);
      const otherApiDigest = `TRAME_API_DIGEST=sha256:${'e'.repeat(64)}\n`;
      appendFileSync(host.releasesPath(`${inService}.env`), otherApiDigest);
      host.forgetCalls();

      const run = host.deploy(host.publishedVersion('B'));

      expect(run.exitCode).toBe(3);
      expect(run.stderr).toContain(`point de restauration ${inService} incomplet`);
      expect(host.calls()).toEqual([]);
    });
  });

  describe('Version non vérifiée', () => {
    let inService: string;

    beforeEach(() => {
      inService = host.publishedVersion('A');
      host.deploy(inService);
      host.forgetCalls();
    });

    function expectNothingTouched(): void {
      expect(host.calls('docker')).toEqual([]);
      expect(host.recordedVersion('current')).toBe(inService);
    }

    it('refuse un commit sans manifeste de version, sans rien précharger, migrer ni redémarrer', () => {
      const unpublished = host.commitVersion('B');

      const run = host.deploy(unpublished);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain(`Manifeste de version introuvable pour ${unpublished}`);
      expect(run.stderr).toContain(`Version ${unpublished} refusée`);
      expectNothingTouched();
    });

    it('refuse une version dont une image n’est pas signée pour ce commit', () => {
      const commit = host.publishedVersion('B');
      host.refusesSignatureOf(host.imageReference(commit, 'worker'));

      const run = host.deploy(commit);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain('Signature refusée pour worker');
      expectNothingTouched();
    });

    it('n’extrait aucun fichier d’un commit refusé', () => {
      const unpublished = host.commitVersion('B');

      host.deploy(unpublished);

      expect(existsSync(host.releasesPath(unpublished))).toBe(false);
      expect(existsSync(host.releasesPath(`${unpublished}.env`))).toBe(false);
    });

    it('s’arrête si la vérification ne peut pas aboutir, faute d’outil', () => {
      const commit = host.publishedVersion('B');
      host.withoutTool('cosign');

      const run = host.deploy(commit);

      expect(run.exitCode).toBe(3);
      expect(run.stderr).toContain('cosign introuvable');
      expectNothingTouched();
    });

    it('refuse une version publiée sans fichier Compose du staging, sans rien toucher', () => {
      const commit = host.commitWithoutStagingCompose('antérieure au staging');
      host.publish(commit);

      const run = host.deploy(commit);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain(`infra/compose/staging.yml absent du commit ${commit}`);
      expectNothingTouched();
      expect(existsSync(host.releasesPath(commit))).toBe(false);
    });

    it('s’arrête quand le clone ne contient pas le commit vérifié, même mis à jour', () => {
      const unknownCommit = 'f'.repeat(40);
      host.publish(unknownCommit);

      const run = host.deploy(unknownCommit);

      expect(run.exitCode).toBe(3);
      expect(run.stderr).toContain(`${unknownCommit} absent du clone`);
      expectNothingTouched();
    });

    it('s’arrête quand le clone ne peut pas être mis à jour', () => {
      const commit = host.publishedVersion('B');
      host.makeOriginUnreachable();

      const run = host.deploy(commit);

      expect(run.exitCode).toBe(3);
      expect(run.stderr).toContain('mise à jour du clone impossible');
      expectNothingTouched();
    });

    it('refuse un argument qui n’est pas un commit complet', () => {
      const run = host.deploy('main');

      expect(run.exitCode).toBe(2);
      expect(run.stderr).toContain('Usage : deploy.sh');
      expect(host.calls()).toEqual([]);
    });
  });
});
