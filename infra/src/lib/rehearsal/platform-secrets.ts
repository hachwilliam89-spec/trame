import { randomBytes } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Les secrets d'une répétition, générés comme le runbook les génère sur le VPS. */
export interface PlatformSecrets {
  postgres: string;
  rabbitmqAdmin: string;
  keycloakDatabase: string;
  keycloakAdmin: string;
  stagingMigrator: string;
  stagingApi: string;
  stagingRelay: string;
  stagingWorker: string;
}

export const KEYCLOAK_TEMPORARY_ADMIN = 'repetition-admin';

function secret(): string {
  return randomBytes(24).toString('base64url');
}

export function generatePlatformSecrets(): PlatformSecrets {
  return {
    postgres: secret(),
    rabbitmqAdmin: secret(),
    keycloakDatabase: secret(),
    keycloakAdmin: secret(),
    stagingMigrator: secret(),
    stagingApi: secret(),
    stagingRelay: secret(),
    stagingWorker: secret(),
  };
}

/**
 * Écrit les fichiers d'environnement des deux stacks, avec les droits du VPS : dossiers 0700,
 * fichiers 0600. Les noms suivent infra/compose/secrets.example.
 */
export async function writeSecretFiles(root: string, secrets: PlatformSecrets): Promise<void> {
  const apiDatabase = `postgresql://trame_staging_api:${secrets.stagingApi}@postgres:5432/trame_staging`;
  await writeDirectory(join(root, 'shared', 'secrets'), {
    'postgres.env': [`POSTGRES_PASSWORD=${secrets.postgres}`],
    'rabbitmq.env': [
      'RABBITMQ_DEFAULT_USER=trame-admin',
      `RABBITMQ_DEFAULT_PASS=${secrets.rabbitmqAdmin}`,
    ],
    'keycloak.env': [
      `KC_DB_PASSWORD=${secrets.keycloakDatabase}`,
      `KC_BOOTSTRAP_ADMIN_USERNAME=${KEYCLOAK_TEMPORARY_ADMIN}`,
      `KC_BOOTSTRAP_ADMIN_PASSWORD=${secrets.keycloakAdmin}`,
    ],
  });
  await writeDirectory(join(root, 'staging', 'secrets'), {
    'migrator.env': [
      `DATABASE_URL=postgresql://trame_staging_migrator:${secrets.stagingMigrator}@postgres:5432/trame_staging`,
    ],
    'api.env': [`DATABASE_URL=${apiDatabase}`],
    'relay.env': [
      `DATABASE_URL=${apiDatabase}`,
      `AMQP_URL=amqp://trame_staging_relay:${secrets.stagingRelay}@rabbitmq:5672/trame-staging`,
    ],
    'worker.env': [
      `AMQP_URL=amqp://trame_staging_worker:${secrets.stagingWorker}@rabbitmq:5672/trame-staging`,
    ],
  });
}

async function writeDirectory(directory: string, files: Record<string, string[]>): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  for (const [name, lines] of Object.entries(files)) {
    await writeFile(join(directory, name), `${lines.join('\n')}\n`, { mode: 0o600 });
  }
}
