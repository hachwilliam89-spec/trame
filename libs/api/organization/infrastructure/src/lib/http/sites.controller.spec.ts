import type { INestApplication } from '@nestjs/common';
import { problemTypes, sitePageV1, siteV1 } from '@trame/shared/contracts';
import { TEST_NOW, TestClient, createOrganizationTestApp, testActors } from '../../testing';

const colmar = { code: 'COL', name: 'Entrepôt de Colmar', timeZone: 'Europe/Paris' };
const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';

describe('API des sites', () => {
  let app: INestApplication;
  let admin: TestClient;
  let manager: TestClient;
  let employee: TestClient;
  let adminOfB: TestClient;
  let anonymous: TestClient;

  beforeEach(async () => {
    app = await createOrganizationTestApp();
    admin = new TestClient(app, testActors.adminOfA);
    manager = new TestClient(app, testActors.managerOfA);
    employee = new TestClient(app, testActors.employeeOfA);
    adminOfB = new TestClient(app, testActors.adminOfB);
    anonymous = new TestClient(app);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /sites', () => {
    it('crée un site conforme au contrat', async () => {
      const response = await admin.post('/sites', colmar);

      expect(response.status).toBe(201);
      expect(siteV1.parse(response.body)).toEqual({
        id: '00000000-0000-7000-8000-000000000001',
        ...colmar,
        createdAt: TEST_NOW.toString(),
      });
    });

    it('applique le fuseau Europe/Paris par défaut', async () => {
      const response = await admin.post('/sites', { code: 'COL', name: 'Colmar' });

      expect(response.body.timeZone).toBe('Europe/Paris');
    });

    it("ignore une organisation fournie dans le corps : elle vient de l'utilisateur", async () => {
      await admin.post('/sites', { ...colmar, organizationId: testActors.adminOfB.organizationId });

      const pageOfB = await adminOfB.get('/sites');

      expect(pageOfB.body.items).toEqual([]);
    });

    it('refuse un code de site mal formé, avec un pointeur vers le champ', async () => {
      const response = await admin.post('/sites', { ...colmar, code: 'col' });

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(response.body.errors).toEqual([expect.objectContaining({ pointer: '#/code' })]);
    });

    it('refuse un nom contenant le caractère NUL, avec un pointeur vers le champ', async () => {
      const response = await admin.post('/sites', { ...colmar, name: 'Col\u0000mar' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([expect.objectContaining({ pointer: '#/name' })]);
    });

    it('refuse un fuseau inconnu comme une erreur de validation', async () => {
      const response = await admin.post('/sites', { ...colmar, timeZone: 'Europe/Colmar' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([
        {
          pointer: '#/timeZone',
          code: 'unknown_time_zone',
          detail: expect.stringContaining('« Europe/Colmar »'),
        },
      ]);
    });

    it("répond 409 avec un type de problème dédié quand le code est pris dans l'organisation", async () => {
      await admin.post('/sites', colmar);

      const response = await admin.post('/sites', { ...colmar, name: 'Colmar bis' });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        type: problemTypes.siteCodeAlreadyUsed,
        title: 'Code de site déjà utilisé',
        status: 409,
        instance: '/sites',
      });
    });

    it('accepte le même code dans une autre organisation', async () => {
      await admin.post('/sites', colmar);

      expect((await adminOfB.post('/sites', colmar)).status).toBe(201);
    });

    it('refuse un utilisateur non authentifié (401) et un manager (403)', async () => {
      expect((await anonymous.post('/sites', colmar)).status).toBe(401);
      expect((await manager.post('/sites', colmar)).status).toBe(403);
    });
  });

  describe('GET /sites', () => {
    it("liste les sites de l'organisation, page par page", async () => {
      await admin.post('/sites', colmar);
      await admin.post('/sites', { ...colmar, code: 'LYS' });
      await admin.post('/sites', { ...colmar, code: 'MUL' });

      const firstPage = sitePageV1.parse((await manager.get('/sites?limit=2')).body);
      const secondPage = sitePageV1.parse(
        (await manager.get(`/sites?limit=2&cursor=${firstPage.nextCursor}`)).body,
      );

      expect(firstPage.items.map((site) => site.code)).toEqual(['COL', 'LYS']);
      expect(secondPage.items.map((site) => site.code)).toEqual(['MUL']);
      expect(secondPage.nextCursor).toBeNull();
    });

    it("accès croisé : ne montre aucun site d'une autre organisation", async () => {
      await admin.post('/sites', colmar);

      const response = await adminOfB.get('/sites');

      expect(response.body).toEqual({ items: [], nextCursor: null });
    });

    it('refuse une limite hors bornes et un curseur mal formé', async () => {
      expect((await manager.get('/sites?limit=500')).status).toBe(400);
      expect((await manager.get('/sites?cursor=abc')).status).toBe(400);
    });

    it('refuse un employé (403)', async () => {
      expect((await employee.get('/sites')).status).toBe(403);
    });
  });

  describe('GET /sites/:siteId', () => {
    it('lit un site', async () => {
      const created = await admin.post('/sites', colmar);

      const response = await manager.get(`/sites/${created.body.id}`);

      expect(response.status).toBe(200);
      expect(response.body.code).toBe('COL');
    });

    it("accès croisé : répond 404 pour le site d'une autre organisation, comme pour un site absent", async () => {
      const created = await admin.post('/sites', colmar);

      const crossOrganization = await adminOfB.get(`/sites/${created.body.id}`);
      const missing = await adminOfB.get(`/sites/${UNKNOWN_ID}`);

      expect(crossOrganization.status).toBe(404);
      expect(crossOrganization.body).toEqual({
        ...missing.body,
        instance: crossOrganization.body.instance,
      });
    });

    it('répond 404 pour un identifiant mal formé', async () => {
      const response = await manager.get('/sites/pas-un-uuid');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    });
  });
});
