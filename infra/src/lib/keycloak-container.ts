import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { reserveFreePort } from './dev-stack';

const run = promisify(execFile);

export interface KeycloakContainer {
  baseUrl: string;
  /** Administration du serveur : compte initial du conteneur jetable, propre au test. */
  adminToken(): Promise<string>;
  stop(): Promise<void>;
}

/** L'image figée de `dev.yml` : la même version de Keycloak pour le poste et pour ces tests. */
function keycloakImage(): string {
  const compose = readFileSync(join(__dirname, '../../compose/dev.yml'), 'utf8');
  const match = /image: (quay\.io\/keycloak\/keycloak:[^\s]+@sha256:[0-9a-f]{64})/.exec(compose);
  if (match?.[1] === undefined) throw new Error('Image Keycloak figée introuvable dans dev.yml.');
  return match[1];
}

/**
 * Keycloak jetable qui importe un realm généré. Le compte d'administration initial n'existe que
 * dans ce conteneur, détruit à la fin du test.
 */
export async function startKeycloakWithRealm(realmFile: string): Promise<KeycloakContainer> {
  const port = await reserveFreePort();
  const adminPassword = 'test-only-' + process.pid;
  const name = 'trame-realm-test-' + process.pid;
  await run('docker', [
    'run',
    '--detach',
    '--rm',
    '--name',
    name,
    '--publish',
    `127.0.0.1:${port}:8080`,
    '--env',
    'KC_BOOTSTRAP_ADMIN_USERNAME=test-admin',
    '--env',
    `KC_BOOTSTRAP_ADMIN_PASSWORD=${adminPassword}`,
    '--volume',
    `${realmFile}:/opt/keycloak/data/import/realm.json:ro`,
    keycloakImage(),
    'start-dev',
    '--import-realm',
  ]);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitUntilReady(baseUrl);
  } catch (error) {
    // Sans les journaux, un import de realm refusé ne se distingue pas d'un démarrage lent.
    const { stdout, stderr } = await run('docker', ['logs', '--tail', '60', name]).catch(() => ({
      stdout: '',
      stderr: 'journaux indisponibles',
    }));
    await run('docker', ['rm', '--force', name]).catch(() => undefined);
    throw new Error(`${String(error)}\nJournaux de Keycloak :\n${stdout}${stderr}`);
  }
  return {
    baseUrl,
    adminToken: () => masterAdminToken(baseUrl, adminPassword),
    stop: async () => {
      await run('docker', ['rm', '--force', name]);
    },
  };
}

async function waitUntilReady(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/realms/master`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return;
    } catch {
      // Keycloak démarre : on réessaie.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Keycloak n’a pas démarré en 120 s.');
}

async function masterAdminToken(baseUrl: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: 'test-admin',
      password,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Jeton d’administration refusé : HTTP ' + response.status);
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}
