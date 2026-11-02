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

  it("n'écrit que les champs autorisés : ni query string, ni en-têtes libres, ni adresse IP", async () => {
    const { port } = capture.server.address() as AddressInfo;

    await request(`http://127.0.0.1:${port}`)
      .get('/api/v1/sites?token=secret123&email=jane@example.org')
      .set('Referer', 'https://exemple.test/page?session=abc987')
      .set('Authorization', 'Bearer jeton-secret')
      .set('Cookie', 'sid=cookie-secret')
      .set('X-Forwarded-Uri', '/api/v1/sites?token=transfere-secret')
      .set('X-Original-Url', '/api/v1/sites?token=original-secret')
      .set('User-Agent', 'trame-test/1.0');

    const log = capture.lines.join('\n');
    for (const secret of [
      'secret123',
      'jane@example.org',
      'abc987',
      'jeton-secret',
      'cookie-secret',
      'transfere-secret',
      'original-secret',
      '127.0.0.1',
    ]) {
      expect(log).not.toContain(secret);
    }

    const entry = JSON.parse(capture.lines.at(-1) ?? '{}') as {
      req: Record<string, unknown>;
      res: Record<string, unknown>;
    };
    expect(entry.req).toEqual({
      id: expect.any(String),
      method: 'GET',
      url: '/api/v1/sites',
      headers: { 'user-agent': 'trame-test/1.0' },
    });
    expect(entry.res).toEqual({ statusCode: 200 });
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
