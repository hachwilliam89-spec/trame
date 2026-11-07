import { type Server, createConnection, createServer } from 'node:net';
import { runCommand } from './command';
import { rehearsedContainers } from './container-watch';

const OUTSIDE_NETWORK = 'trame-repetition-exterieur';

export interface ProbeTarget {
  label: string;
  host: string;
  port: number;
}

/** Les liaisons de ports vers l'hôte de chaque conteneur de Trame : aucune n'est attendue. */
export async function publishedPorts(): Promise<Record<string, string>> {
  const bindings: Record<string, string> = {};
  for (const container of await rehearsedContainers()) {
    const output = await runCommand('docker', [
      'inspect',
      '--format',
      '{{.Name}}\t{{json .HostConfig.PortBindings}}',
      container,
    ]);
    const [name = container, ports = 'null'] = output.trim().split('\t');
    if (ports !== 'null' && ports !== '{}') {
      bindings[name] = ports;
    }
  }
  return bindings;
}

/** Les adresses d'un conteneur sur chacun de ses réseaux. */
export async function containerAddresses(container: string): Promise<string[]> {
  const output = await runCommand('docker', [
    'inspect',
    '--format',
    '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}',
    container,
  ]);
  return output.split(' ').filter((address) => address.trim() !== '');
}

/**
 * Tente chaque connexion TCP depuis un client « extérieur » : un conteneur sur un réseau à lui, qui
 * joint l'hôte par host-gateway, comme un client d'Internet joint le VPS. Rend les cibles
 * joignables. L'image de Keycloak, déjà construite, fournit bash et timeout.
 */
export async function reachableFromOutside(
  probeImage: string,
  targets: ProbeTarget[],
): Promise<string[]> {
  await runCommand('docker', ['network', 'create', OUTSIDE_NETWORK]).catch(() => '');
  const attempts = targets
    .map(
      (target) =>
        `if timeout 3 bash -c 'exec 3<>/dev/tcp/${target.host}/${String(target.port)}' 2>/dev/null; ` +
        `then echo '${target.label}'; fi`,
    )
    .join('\n');
  const output = await runCommand('docker', [
    'run',
    '--rm',
    '--network',
    OUTSIDE_NETWORK,
    '--add-host',
    'host.docker.internal:host-gateway',
    '--entrypoint',
    'bash',
    probeImage,
    '-c',
    attempts,
  ]);
  return output.split('\n').filter((label) => label !== '');
}

export async function removeOutsideNetwork(): Promise<void> {
  await runCommand('docker', ['network', 'rm', OUTSIDE_NETWORK]).catch(() => '');
}

/**
 * L'équivalent de `ssh -L 18080:<Keycloak>:8080` : un relais local vers la console
 * d'administration, que Traefik ne route pas.
 */
export async function openAdminTunnel(
  localPort: number,
  targetHost: string,
  targetPort: number,
): Promise<Server> {
  const server = createServer((client) => {
    const upstream = createConnection(targetPort, targetHost);
    client.pipe(upstream).pipe(client);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
  });
  await new Promise<void>((resolve) => server.listen(localPort, '127.0.0.1', resolve));
  return server;
}
