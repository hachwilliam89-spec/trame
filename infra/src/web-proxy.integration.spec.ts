import { createServer, request } from 'node:http';
import { reserveFreePort } from './lib/dev-stack';
import { startWebServer } from './lib/web-test-server';

describe('Proxy du build web de test', () => {
  it('garde une autorité amont fixe et transmet le chemin comme donnée', async () => {
    const api = createServer((incoming, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ path: incoming.url, host: incoming.headers.host }));
    });
    const port = await reserveFreePort();
    await new Promise<void>((done) => api.listen(port, '127.0.0.1', done));
    const web = await startWebServer({
      port: await reserveFreePort(),
      apiOrigin: 'http://127.0.0.1:' + port,
      issuerOrigin: 'http://127.0.0.1:8080',
    });
    try {
      const path = '/api/../http://example.invalid/endpoint';
      const result = await new Promise<string>((resolve, reject) => {
        const destination = new URL(web.origin);
        const outgoing = request(
          {
            hostname: destination.hostname,
            port: destination.port,
            path,
            headers: { host: 'example.invalid' },
          },
          (incoming) => {
            let data = '';
            incoming.on('data', (chunk) => {
              data += String(chunk);
            });
            incoming.on('end', () => resolve(data));
          },
        );
        outgoing.on('error', reject);
        outgoing.end();
      });
      expect(JSON.parse(result)).toEqual({ path, host: '127.0.0.1:' + port });
    } finally {
      await web.stop();
      await new Promise<void>((done) => api.close(() => done()));
    }
  });
});
