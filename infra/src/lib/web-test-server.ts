import {
  createServer,
  request as proxyRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

/** Sert le vrai build Angular et son proxy, sur une origine isolée de chaque test. */
export async function startWebServer(options: {
  port: number;
  apiOrigin: string;
  issuerOrigin: string;
}) {
  const root = resolve(__dirname, '../../../dist/apps/web/browser');
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/api/')) {
      proxy(request, response, options.apiOrigin);
      return;
    }
    void serveAsset(root, request, response, options.issuerOrigin).catch(() => {
      response.writeHead(500);
      response.end();
    });
  });
  await new Promise<void>((done) => server.listen(options.port, '127.0.0.1', done));
  return {
    origin: 'http://127.0.0.1:' + options.port,
    stop: () =>
      new Promise<void>((done, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : done()));
      }),
  };
}
function proxy(request: IncomingMessage, response: ServerResponse, origin: string): void {
  const destination = new URL(request.url ?? '/', origin);
  const headers = { ...request.headers, host: destination.host };
  const outgoing = proxyRequest(destination, { method: request.method, headers }, (incoming) => {
    response.writeHead(incoming.statusCode ?? 502, incoming.headers);
    incoming.pipe(response);
  });
  outgoing.on('error', () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  response.on('close', () => outgoing.destroy());
  request.pipe(outgoing);
}
async function serveAsset(
  root: string,
  request: IncomingMessage,
  response: ServerResponse,
  issuerOrigin: string,
): Promise<void> {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  response.setHeader('Cache-Control', 'no-store');
  if (path === '/config.json') {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        apiBasePath: '/api/v1',
        authServerUrl: issuerOrigin,
        realm: 'trame',
        clientId: 'trame-dev',
      }),
    );
    return;
  }
  const relative = ['/', '/oidc-callback'].includes(path)
    ? '/index.html'
    : decodeURIComponent(path);
  const file = resolve(root, '.' + relative);
  if (!file.startsWith(root + sep)) {
    response.writeHead(404);
    response.end();
    return;
  }
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  try {
    const data = await readFile(file);
    response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end();
  }
}
