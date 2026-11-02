import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { Writable } from 'node:stream';
import pino from 'pino';
import request from 'supertest';
import { LoggingModule } from './logging.module';
import { createPinoHttpOptions } from './pino-http-options';

@Controller()
class PingController {
  @Get('ping')
  ping(): { ok: true } {
    return { ok: true };
  }

  @Get('health/live')
  live(): { ok: true } {
    return { ok: true };
  }
}

describe('createPinoHttpOptions', () => {
  it('masque les en-têtes sensibles', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const options = createPinoHttpOptions({ level: 'info', pretty: false });
    const logger = pino({ level: 'info', redact: options.redact }, sink);

    logger.info({ req: { headers: { authorization: 'Bearer abc', cookie: 'sid=1', host: 'h' } } });

    const entry = JSON.parse(lines[0] ?? '{}') as { req: { headers: Record<string, string> } };
    expect(entry.req.headers).toEqual({ authorization: '[masqué]', cookie: '[masqué]', host: 'h' });
  });
});

describe('LoggingModule', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LoggingModule.forRoot({ level: 'silent', pretty: false, quietPaths: ['/health'] })],
      controllers: [PingController],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('génère un X-Request-Id quand la requête n’en porte pas', async () => {
    const response = await request(app.getHttpServer()).get('/ping');

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reprend un X-Request-Id entrant valide', async () => {
    const response = await request(app.getHttpServer())
      .get('/ping')
      .set('X-Request-Id', 'trace-1234abcd');

    expect(response.headers['x-request-id']).toBe('trace-1234abcd');
  });

  it('remplace un X-Request-Id entrant douteux', async () => {
    const response = await request(app.getHttpServer())
      .get('/ping')
      .set('X-Request-Id', '<script>');

    expect(response.headers['x-request-id']).not.toBe('<script>');
  });
});
