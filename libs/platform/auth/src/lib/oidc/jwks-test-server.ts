import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { JWK } from 'jose';

/**
 * Serveur JWKS local pour les tests du résolveur OIDC : publie un jeu de clés, compte les
 * téléchargements, et simule un fournisseur lent ou en erreur.
 */
export class JwksTestServer {
  #keys: JWK[];
  #requestCount = 0;
  #delayMs = 0;
  #status = 200;

  private constructor(
    private readonly server: Server,
    keys: JWK[],
  ) {
    this.#keys = keys;
  }

  static async start(keys: JWK[]): Promise<JwksTestServer> {
    const server = createServer();
    const jwks = new JwksTestServer(server, keys);
    server.on('request', (_request, response) => {
      jwks.#requestCount++;
      setTimeout(() => {
        response.writeHead(jwks.#status, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ keys: jwks.#keys }));
      }, jwks.#delayMs);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return jwks;
  }

  get url(): URL {
    const { port } = this.server.address() as AddressInfo;
    return new URL(`http://127.0.0.1:${port}/certs`);
  }

  get requestCount(): number {
    return this.#requestCount;
  }

  publish(keys: JWK[]): void {
    this.#keys = keys;
  }

  respondAfter(delayMs: number): void {
    this.#delayMs = delayMs;
  }

  respondWithStatus(status: number): void {
    this.#status = status;
  }

  async close(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
