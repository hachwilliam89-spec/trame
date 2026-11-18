import { createServer, type AddressInfo, type Server } from 'node:net';
import { RESERVED_PORTS, reserveFreePort } from './dev-stack';

// Plage où Linux puise les ports éphémères (/proc/sys/net/ipv4/ip_local_port_range sur les
// runners GitHub). Docker y choisit aussi les ports publiés sans numéro, par exemple ceux de
// Testcontainers : un port réservé dans cette plage peut lui être attribué avant que la stack
// ne démarre, d'où « port is already allocated ».
const LINUX_EPHEMERAL_PORTS = { first: 32_768, last: 60_999 };

/** Écoute sur 127.0.0.1 ; le port 0 laisse le système choisir. */
async function listenOn(port: number): Promise<Server> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return server;
}

function portOf(server: Server): number {
  return (server.address() as AddressInfo).port;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe('reserveFreePort', () => {
  it('réserve un port sous la plage éphémère, où Docker choisit les ports publiés', async () => {
    const port = await reserveFreePort();

    expect(port).toBeGreaterThanOrEqual(RESERVED_PORTS.first);
    expect(port).toBeLessThanOrEqual(RESERVED_PORTS.last);
    expect(RESERVED_PORTS.last).toBeLessThan(LINUX_EPHEMERAL_PORTS.first);
  });

  it('rend un port sur lequel on peut écouter aussitôt', async () => {
    const port = await reserveFreePort();

    await close(await listenOn(port));
  });

  it('ne rend jamais deux fois le même port dans un même processus', async () => {
    const ports: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      ports.push(await reserveFreePort());
    }

    expect(new Set(ports).size).toBe(ports.length);
  });

  it('passe au candidat suivant quand le premier est occupé', async () => {
    const occupied = await listenOn(0);
    const released = await listenOn(0);
    const freePort = portOf(released);
    await close(released);
    const candidates = [portOf(occupied), freePort];
    try {
      const port = await reserveFreePort(() => candidates.shift() ?? freePort);

      expect(port).toBe(freePort);
    } finally {
      await close(occupied);
    }
  });

  it('échoue avec un message clair quand aucun candidat n’est libre', async () => {
    const occupied = await listenOn(0);
    try {
      await expect(reserveFreePort(() => portOf(occupied))).rejects.toThrow(
        `Aucun port libre entre ${RESERVED_PORTS.first} et ${RESERVED_PORTS.last}`,
      );
    } finally {
      await close(occupied);
    }
  });
});
