import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand } from './command';

const AUTHORITY_NICKNAME = 'Autorite de la repetition du staging Trame';
/** Confiance pour authentifier des serveurs TLS, et rien d'autre (ni courriel, ni code). */
const TRUSTED_FOR_TLS_SERVERS = 'C,,';

/**
 * Ajoute l'autorité de test à la base de certificats NSS que Chromium lit à son lancement
 * ($HOME/.pki/nssdb, montée dans le conteneur du serveur Playwright). Le navigateur reconnaît
 * alors les certificats de la répétition comme ceux de Let's Encrypt sur le VPS : la vérification
 * TLS reste entière, et un certificat d'un autre nom ou d'une autre autorité est toujours refusé.
 */
export async function trustAuthorityInBrowser(
  databaseDirectory: string,
  authorityCertificatePath: string,
): Promise<void> {
  const database = `sql:${databaseDirectory}`;
  if (!existsSync(join(databaseDirectory, 'cert9.db'))) {
    await runCommand('certutil', ['-d', database, '-N', '--empty-password']);
  }
  await runCommand('certutil', [
    '-d',
    database,
    '-A',
    '-t',
    TRUSTED_FOR_TLS_SERVERS,
    '-n',
    AUTHORITY_NICKNAME,
    '-i',
    authorityCertificatePath,
  ]);
}

/**
 * L'option de Chromium qui dirige ces noms vers cette machine, à la place du DNS public. Le
 * navigateur tourne dans son propre conteneur, qui ne lit pas /etc/hosts du runner.
 */
export function resolveOnThisHost(hostnames: string[]): string {
  const rules = hostnames.map((hostname) => `MAP ${hostname} 127.0.0.1`);
  return `--host-resolver-rules=${rules.join(', ')}`;
}
