import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseModule } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { AuthModule } from '@trame/platform/auth';
import { testActorResolver } from '@trame/platform/auth/testing';
import { ClockModule } from '@trame/platform/clock';
import { IdsModule } from '@trame/platform/ids';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import { positionV1, skillV1, problemTypes } from '@trame/shared/contracts';
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

  it('crée le catalogue et un poste, puis traduit le refus de suppression PostgreSQL en 409', async () => {
    const admin = new TestClient(app, testActors.adminOfA);
    const manager = new TestClient(app, testActors.managerOfA);
    const siteResponse = await admin.post('/sites', { code: 'POSTES', name: 'Colmar' });
    expect(siteResponse.status).toBe(201);
    const skillResponse = await admin.post('/skills', { name: 'CACES R489' });
    expect(skillResponse.status).toBe(201);
    const skill = skillV1.parse(skillResponse.body);
    const collection = `/sites/${siteResponse.body.id}/positions`;
    const positionResponse = await admin.post(collection, {
      name: 'Cariste',
      skillIds: [skill.id],
    });
    expect(positionResponse.status).toBe(201);
    const position = positionV1.parse(positionResponse.body);

    const deletion = await admin.delete(`/skills/${skill.id}`);

    expect(deletion.status).toBe(409);
    expect(deletion.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(deletion.body.type).toBe(problemTypes.skillInUse);
    const reread = await manager.get(`${collection}/${position.id}`);
    expect(reread.status).toBe(200);
    expect(positionV1.parse(reread.body)).toEqual(position);
  });

  it('refuse une compétence étrangère sans poste partiel, puis supprime une compétence inutilisée', async () => {
    const admin = new TestClient(app, testActors.adminOfA);
    const adminOfB = new TestClient(app, testActors.adminOfB);
    const site = await admin.post('/sites', { code: 'CATALOGUE', name: 'Colmar' });
    expect(site.status).toBe(201);
    const skillResponse = await adminOfB.post('/skills', { name: 'Réception' });
    expect(skillResponse.status).toBe(201);
    const skill = skillV1.parse(skillResponse.body);
    const collection = `/sites/${site.body.id}/positions`;

    expect((await admin.post(collection, { name: 'Cariste', skillIds: [skill.id] })).status).toBe(
      404,
    );
    expect((await admin.get(collection)).body.items).toEqual([]);
    expect((await admin.delete(`/skills/${skill.id}`)).status).toBe(404);
    expect((await adminOfB.delete(`/skills/${skill.id}`)).status).toBe(204);
    expect((await adminOfB.get(`/skills/${skill.id}`)).status).toBe(404);
  });

  it('refuse les noms contenant NUL avant l’écriture PostgreSQL', async () => {
    const admin = new TestClient(app, testActors.adminOfA);
    const site = await admin.post('/sites', { code: 'NUL', name: 'Colmar' });
    expect(site.status).toBe(201);
    const invalidName = 'Réception\u0000';
    const skill = await admin.post('/skills', { name: invalidName });
    const position = await admin.post(`/sites/${site.body.id}/positions`, {
      name: invalidName,
      skillIds: [],
    });

    expect(skill.status).toBe(400);
    expect(position.status).toBe(400);
    for (const response of [skill, position]) {
      expect(response.body.errors).toContainEqual(expect.objectContaining({ pointer: '#/name' }));
    }
    expect((await admin.get(`/sites/${site.body.id}/positions`)).body.items).toEqual([]);
  });

  it('refuse aussi NUL dans le nom d’un site et le libellé d’un créneau, sans erreur 500', async () => {
    const admin = new TestClient(app, testActors.adminOfA);
    const site = await admin.post('/sites', { code: 'NUL-2', name: 'Col\u0000mar' });
    const validSite = await admin.post('/sites', { code: 'NUL-3', name: 'Colmar' });
    const shiftTemplate = await admin.post(`/sites/${validSite.body.id}/shift-templates`, {
      label: 'Nu\u0000it',
      startTime: '22:00',
      endTime: '06:00',
      break: { startTime: '02:00', durationMinutes: 30 },
    });

    expect(site.status).toBe(400);
    expect(site.body.errors).toContainEqual(expect.objectContaining({ pointer: '#/name' }));
    expect(shiftTemplate.status).toBe(400);
    expect(shiftTemplate.body.errors).toContainEqual(
      expect.objectContaining({ pointer: '#/label' }),
    );
  });
});
