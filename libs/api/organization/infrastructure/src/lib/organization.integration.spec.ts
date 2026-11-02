import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseModule } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { AuthModule } from '@trame/platform/auth';
import { testActorResolver } from '@trame/platform/auth/testing';
import { ClockModule } from '@trame/platform/clock';
import { IdsModule } from '@trame/platform/ids';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import { TestClient, testActors } from '../testing';
import { OrganizationModule } from './organization.module';

/** Le module tel qu'il est assemblé en production, sur un vrai PostgreSQL. */
describe('module organization sur PostgreSQL (intégration)', () => {
  let database: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    database = await startTestDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ProblemDetailsModule,
        AuthModule.forRoot({ resolveActor: testActorResolver }),
        ClockModule,
        IdsModule,
        DatabaseModule.forRootAsync({ useFactory: () => ({ url: database.url }) }),
        OrganizationModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await database.stop();
  });

  // Scénario : Créneau de nuit au changement d'heure (US-030), de la requête HTTP à la base.
  it("crée un site et son créneau de nuit, puis calcule 9 h d'amplitude au passage à l'heure d'hiver", async () => {
    const admin = new TestClient(app, testActors.adminOfA);
    const site = await admin.post('/sites', { code: 'COL', name: 'Colmar' });
    const night = await admin.post(`/sites/${site.body.id}/shift-templates`, {
      label: 'Nuit',
      startTime: '22:00',
      endTime: '06:00',
      break: { startTime: '02:00', durationMinutes: 30 },
    });

    const durations = await admin.get(
      `/sites/${site.body.id}/shift-templates/${night.body.id}/durations?date=2026-10-24`,
    );

    expect(site.status).toBe(201);
    expect(night.status).toBe(201);
    expect(durations.body).toMatchObject({ amplitudeMinutes: 540, effectiveMinutes: 510 });
  });

  it("répond 409 pour un code pris, et 404 sur le site d'une autre organisation", async () => {
    const admin = new TestClient(app, testActors.adminOfA);
    const adminOfB = new TestClient(app, testActors.adminOfB);
    const site = await admin.post('/sites', { code: 'MUL', name: 'Mulhouse' });

    expect((await admin.post('/sites', { code: 'MUL', name: 'Mulhouse bis' })).status).toBe(409);
    expect((await adminOfB.get(`/sites/${site.body.id}`)).status).toBe(404);
  });
});
