import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import pinoHttp from 'pino-http';
import request from 'supertest';
import { createPinoHttpOptions, pathOnly } from './pino-http-options';

function captureLogs(): { lines: string[]; server: Server } {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(...chunk.toString().split('\n').filter(Boolean));
      callback();
    },
  });
  const logger = pinoHttp(createPinoHttpOptions({ level: 'info', pretty: false }), sink);
  const server = createServer((req, res) => {
    logger(req, res);
    res.end('ok');
  });
  return { lines, server };
}

describe('journal des requêtes HTTP', () => {
  let capture: ReturnType<typeof captureLogs>;

  beforeEach(async () => {
    capture = captureLogs();
    await new Promise<void>((resolve) => capture.server.listen(0, resolve));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => capture.server.close(() => resolve()));
  });

  it("n'écrit ni la query string ni les paramètres, seulement le chemin", async () => {
    const { port } = capture.server.address() as AddressInfo;

    await request(`http://127.0.0.1:${port}`)
      .get('/api/v1/sites?token=secret123&email=jane@example.org')
      .set('Referer', 'https://exemple.test/page?session=abc987')
      .set('Authorization', 'Bearer jeton-secret');

    const log = capture.lines.join('\n');
    expect(log).not.toContain('secret123');
    expect(log).not.toContain('jane@example.org');
    expect(log).not.toContain('abc987');
    expect(log).not.toContain('jeton-secret');

    const entry = JSON.parse(capture.lines.at(-1) ?? '{}') as {
      req: { url: string; query?: unknown; params?: unknown; headers: Record<string, string> };
    };
    expect(entry.req.url).toBe('/api/v1/sites');
    expect(entry.req).not.toHaveProperty('query');
    expect(entry.req).not.toHaveProperty('params');
    expect(entry.req.headers['authorization']).toBe('[masqué]');
    expect(entry.req.headers['referer']).toBe('[masqué]');
  });
});

describe('pathOnly', () => {
  it('retire la query string et le fragment', () => {
    expect(pathOnly('/a/b?x=1#y')).toBe('/a/b');
    expect(pathOnly('/a#y')).toBe('/a');
    expect(pathOnly('/a')).toBe('/a');
    expect(pathOnly(undefined)).toBeUndefined();
  });
});
