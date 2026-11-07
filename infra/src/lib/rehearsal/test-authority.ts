import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from './command';

export interface TestAuthority {
  /** Certificat de l'autorité, que curl et le navigateur de la répétition reconnaissent. */
  certificatePath: string;
  /** Dossier monté dans Traefik : certificat et clé du serveur, pour les noms publics. */
  serverDirectory: string;
}

const VALIDITY_DAYS = '2';

/**
 * Autorité de certification créée pour une seule répétition : elle remplace Let's Encrypt, sans
 * que la vérification TLS soit désactivée nulle part. Sa clé ne quitte pas le dossier temporaire.
 */
export async function createTestAuthority(
  directory: string,
  hostnames: string[],
): Promise<TestAuthority> {
  const authority = {
    certificatePath: join(directory, 'authority.pem'),
    keyPath: join(directory, 'authority-key.pem'),
  };
  const serverDirectory = join(directory, 'server');
  await mkdir(serverDirectory, { recursive: true });
  await createAuthorityCertificate(authority.certificatePath, authority.keyPath);
  await createServerCertificate(directory, serverDirectory, hostnames, authority);
  return { certificatePath: authority.certificatePath, serverDirectory };
}

async function createAuthorityCertificate(certificatePath: string, keyPath: string): Promise<void> {
  await runCommand('openssl', [
    'req',
    '-x509',
    ...ellipticKey(keyPath),
    '-out',
    certificatePath,
    '-days',
    VALIDITY_DAYS,
    '-subj',
    '/CN=Autorite de la repetition du staging Trame',
    '-addext',
    'basicConstraints=critical,CA:TRUE,pathlen:0',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
  ]);
}

/** Un certificat de serveur pour les noms publics, signé par l'autorité de test. */
async function createServerCertificate(
  directory: string,
  serverDirectory: string,
  hostnames: string[],
  authority: { certificatePath: string; keyPath: string },
): Promise<void> {
  const request = join(directory, 'server.csr');
  await runCommand('openssl', [
    'req',
    ...ellipticKey(join(serverDirectory, 'server-key.pem')),
    '-out',
    request,
    '-subj',
    `/CN=${hostnames[0] ?? ''}`,
  ]);
  const extensions = join(directory, 'server-extensions.cnf');
  const alternativeNames = hostnames.map((hostname) => `DNS:${hostname}`).join(',');
  await writeFile(
    extensions,
    [
      `subjectAltName=${alternativeNames}`,
      'basicConstraints=critical,CA:FALSE',
      'keyUsage=critical,digitalSignature',
      'extendedKeyUsage=serverAuth',
      '',
    ].join('\n'),
  );
  await runCommand('openssl', [
    'x509',
    '-req',
    '-in',
    request,
    '-CA',
    authority.certificatePath,
    '-CAkey',
    authority.keyPath,
    '-CAcreateserial',
    '-out',
    join(serverDirectory, 'server.pem'),
    '-days',
    VALIDITY_DAYS,
    '-extfile',
    extensions,
  ]);
}

function ellipticKey(keyPath: string): string[] {
  return [
    '-newkey',
    'ec',
    '-pkeyopt',
    'ec_paramgen_curve:prime256v1',
    '-nodes',
    '-keyout',
    keyPath,
  ];
}
