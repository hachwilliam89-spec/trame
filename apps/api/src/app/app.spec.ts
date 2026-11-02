import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseReadiness } from '@trame/api/database';
import request from 'supertest';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

describe('API (socle)', () => {
  let app: INestApplication;
  const database = { name: 'database', check: vi.fn<() => Promise<void>>() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseReadiness)
      .useValue(database)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sert la sonde de vie sous /api/v1', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('vérifie la base dans la sonde de disponibilité', async () => {
    database.check.mockResolvedValueOnce(undefined);
    expect((await request(app.getHttpServer()).get('/api/v1/health/ready')).status).toBe(200);

    database.check.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const down = await request(app.getHttpServer()).get('/api/v1/health/ready');
    expect(down.status).toBe(503);
    expect(down.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  it('répond en problem+json sur une route inconnue', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/inconnue');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  it("masque l'en-tête X-Powered-By (ADR-0021)", async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it("n'expose rien hors du préfixe /api/v1", async () => {
    expect((await request(app.getHttpServer()).get('/health/live')).status).toBe(404);
  });
});
