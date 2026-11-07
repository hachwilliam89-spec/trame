import { join } from 'node:path';
import { type ScriptRun, runScriptInContainer } from '../container-script';
import { COMPOSE_DIRECTORY } from '../deployed-stacks';
import { runCommand } from './command';
import type { PlatformSecrets } from './platform-secrets';

const SHARED_FILE = join(COMPOSE_DIRECTORY, 'shared.yml');
const PROVISIONING_DIRECTORY = join(__dirname, '../../../provisioning');
/** L'adresse locale du tunnel SSH vers la console d'administration de Keycloak (runbook). */
export const KEYCLOAK_ADMIN_URL = 'http://127.0.0.1:18080';

/**
 * La stack `trame-shared` de la répétition, sous son vrai nom de projet : `deploy.sh` y cherche
 * PostgreSQL par les étiquettes de ce projet. Démarrée et provisionnée dans l'ordre du runbook.
 */
export class SharedStack {
  constructor(private readonly secretsDirectory: string) {}

  async compose(...args: string[]): Promise<string> {
    return runCommand(
      'docker',
      ['compose', '--project-name', 'trame-shared', '--file', SHARED_FILE, ...args],
      {
        environment: {
          ...process.env,
          TRAME_SECRETS_DIR: this.secretsDirectory,
          KEYCLOAK_ADMIN_URL,
        },
        timeoutMilliseconds: 900_000,
      },
    );
  }

  async start(secrets: PlatformSecrets): Promise<void> {
    await this.compose('build', 'keycloak');
    await this.startHealthy('postgres', 'rabbitmq');
    await this.provision(secrets);
    await this.startHealthy('keycloak');
  }

  async containerOf(service: string): Promise<string> {
    return (await this.compose('ps', '--quiet', service)).trim();
  }

  async remove(): Promise<void> {
    await this.compose('down', '--volumes', '--remove-orphans');
  }

  /** Démarre des services et attend qu'ils soient sains ; sinon, joint leurs journaux. */
  private async startHealthy(...services: string[]): Promise<void> {
    try {
      await this.compose('up', '--detach', '--wait', '--wait-timeout', '300', ...services);
    } catch (error) {
      const logs = await this.compose('logs', '--no-color', '--tail', '80', ...services).catch(
        (logError: unknown) => String(logError),
      );
      throw new Error(`${String(error)}\n--- journaux ---\n${logs}`, { cause: error });
    }
  }

  private async provision(secrets: PlatformSecrets): Promise<void> {
    await this.psql('postgres-cluster.sql', {});
    await this.psql('postgres-keycloak.sql', {
      TRAME_KEYCLOAK_DATABASE_PASSWORD: secrets.keycloakDatabase,
    });
    await this.psql('postgres-environment.sql', {
      TRAME_ENVIRONMENT: 'staging',
      TRAME_MIGRATOR_PASSWORD: secrets.stagingMigrator,
      TRAME_API_PASSWORD: secrets.stagingApi,
    });
    await this.runProvisioning('rabbitmq', ['sh', '-s'], 'rabbitmq-environment.sh', {
      TRAME_ENVIRONMENT: 'staging',
      TRAME_RELAY_PASSWORD: secrets.stagingRelay,
      TRAME_WORKER_PASSWORD: secrets.stagingWorker,
    });
  }

  private psql(script: string, environment: Record<string, string>): Promise<void> {
    return this.runProvisioning(
      'postgres',
      ['psql', '--no-psqlrc', '--username', 'postgres', '--dbname', 'postgres'],
      script,
      environment,
    );
  }

  private async runProvisioning(
    service: string,
    command: string[],
    script: string,
    environment: Record<string, string>,
  ): Promise<void> {
    const run: ScriptRun = await runScriptInContainer({
      containerId: await this.containerOf(service),
      command,
      scriptPath: join(PROVISIONING_DIRECTORY, script),
      environment,
    });
    if (run.exitCode !== 0) {
      throw new Error(
        `Provisionnement ${script} en échec (${String(run.exitCode)}) : ${run.stderr}`,
      );
    }
  }
}
