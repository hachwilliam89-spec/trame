import { type INestApplication, Injectable, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import request from 'supertest';
import { HealthModule } from './health.module';
import type { ReadinessIndicator } from './readiness-indicator';

const state = { databaseUp: true };

@Injectable()
class FakeDatabaseIndicator implements ReadinessIndicator {
  readonly name = 'database';

  async check(): Promise<void> {
    if (!state.databaseUp) {
      throw new Error('connexion refusée par 10.0.0.12:5432');
    }
  }
}

describe('HealthModule', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ProblemDetailsModule,
        HealthModule.forRoot({ indicators: [FakeDatabaseIndicator] }),
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    state.databaseUp = true;
  });

  it('health/live répond 200 sans vérifier les dépendances', async () => {
    state.databaseUp = false;

    const response = await request(app.getHttpServer()).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('health/ready répond 200 quand les dépendances répondent', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', details: { database: { status: 'up' } } });
  });

  it('health/ready répond 503 en problem+json, sans détail interne', async () => {
    state.databaseUp = false;
    const warned = vi.spyOn(Logger.prototype, 'warn');

    const response = await request(app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toMatchObject({
      status: 503,
      checks: { database: { status: 'down', message: 'indisponible' } },
    });
    expect(JSON.stringify(response.body)).not.toContain('10.0.0.12');

    expect(warned).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'Dépendance indisponible', indicator: 'database' }),
    );
    expect(JSON.stringify(warned.mock.calls)).not.toContain('10.0.0.12');
    warned.mockRestore();
  });
});
