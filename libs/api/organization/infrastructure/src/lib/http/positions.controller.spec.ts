import type { INestApplication } from '@nestjs/common';
import { TestClient, createOrganizationTestApp, testActors } from '../../testing';

const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';

describe('API des postes (US-030 B)', () => {
  let app: INestApplication;
  let admin: TestClient;
  let manager: TestClient;
  let adminOfB: TestClient;
  let siteId: string;

  beforeEach(async () => {
    app = await createOrganizationTestApp();
    admin = new TestClient(app, testActors.adminOfA);
    manager = new TestClient(app, testActors.managerOfA);
    adminOfB = new TestClient(app, testActors.adminOfB);
    const site = await admin.post('/sites', { code: 'COL', name: 'Colmar' });
    expect(site.status).toBe(201);
    siteId = site.body.id;
  });
  afterEach(async () => {
    await app.close();
  });

  it('BDD poste sans compétence spécifique : accepte une liste vide', async () => {
    const created = await admin.post(`/sites/${siteId}/positions`, {
      name: 'Préparation',
      skillIds: [],
    });
    expect(created.status).toBe(201);
    const response = await manager.get(`/sites/${siteId}/positions/${created.body.id}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(created.body);
    expect(response.body).toMatchObject({ siteId, name: 'Préparation', skillIds: [] });
  });

  it('BDD poste avec plusieurs compétences : conserve toutes ses exigences', async () => {
    const caces = await admin.post('/skills', { name: 'CACES R489' });
    const reception = await admin.post('/skills', { name: 'Réception' });
    expect(caces.status).toBe(201);
    expect(reception.status).toBe(201);
    const skillIds = [caces.body.id, reception.body.id];
    const created = await admin.post(`/sites/${siteId}/positions`, { name: 'Cariste', skillIds });
    expect(created.status).toBe(201);
    const response = await manager.get(`/sites/${siteId}/positions/${created.body.id}`);
    expect(response.body.skillIds).toEqual(skillIds);
  });

  it('BDD référence invalide : une compétence étrangère est indiscernable d’une compétence absente', async () => {
    const foreignSkill = await adminOfB.post('/skills', { name: 'CACES' });
    expect(foreignSkill.status).toBe(201);
    const foreign = await admin.post(`/sites/${siteId}/positions`, {
      name: 'Cariste',
      skillIds: [foreignSkill.body.id],
    });
    const missing = await admin.post(`/sites/${siteId}/positions`, {
      name: 'Cariste',
      skillIds: [UNKNOWN_ID],
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect((await manager.get(`/sites/${siteId}/positions`)).body.items).toEqual([]);
  });

  it('refuse les compétences répétées, même avec des UUID de casses différentes', async () => {
    const skill = await admin.post('/skills', { name: 'CACES' });
    expect(skill.status).toBe(201);
    const repeated = await admin.post(`/sites/${siteId}/positions`, {
      name: 'Cariste',
      skillIds: [skill.body.id, skill.body.id],
    });
    expect(repeated.status).toBe(400);
    expect(repeated.body.errors).toContainEqual(expect.objectContaining({ pointer: '#/skillIds' }));
    const upper = '0190F0A0-0000-7000-8000-0000000000FF';
    expect(
      (
        await admin.post(`/sites/${siteId}/positions`, {
          name: 'Cariste',
          skillIds: [upper, upper.toLowerCase()],
        })
      ).status,
    ).toBe(400);
  });

  it.each(['', '   ', 'a'.repeat(101)])('refuse le nom invalide %j', async (name) => {
    const response = await admin.post(`/sites/${siteId}/positions`, { name, skillIds: [] });
    expect(response.status).toBe(400);
    expect(response.body.errors).toContainEqual(expect.objectContaining({ pointer: '#/name' }));
  });

  it('refuse une liste absente ou un identifiant de compétence mal formé', async () => {
    expect((await admin.post(`/sites/${siteId}/positions`, { name: 'Cariste' })).status).toBe(400);
    expect(
      (await admin.post(`/sites/${siteId}/positions`, { name: 'Cariste', skillIds: ['invalide'] }))
        .status,
    ).toBe(400);
  });

  it('BDD pagination : isole le site et accepte les libellés identiques', async () => {
    for (let index = 0; index < 3; index += 1) {
      expect(
        (await admin.post(`/sites/${siteId}/positions`, { name: 'Préparation', skillIds: [] }))
          .status,
      ).toBe(201);
    }
    const otherSite = await admin.post('/sites', { code: 'MUL', name: 'Mulhouse' });
    await admin.post(`/sites/${otherSite.body.id}/positions`, { name: 'Réception', skillIds: [] });
    const first = await manager.get(`/sites/${siteId}/positions?limit=2`);
    expect(first.status).toBe(200);
    const second = await manager.get(
      `/sites/${siteId}/positions?limit=2&cursor=${first.body.nextCursor}`,
    );
    expect(first.body.items).toHaveLength(2);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    const all = [...first.body.items, ...second.body.items] as { id: string; siteId: string }[];
    expect(new Set(all.map((position) => position.id)).size).toBe(3);
    expect(all.every((position) => position.siteId === siteId)).toBe(true);
  });

  it('BDD accès croisé : refuse création, liste et lecture sur le site de A', async () => {
    const created = await admin.post(`/sites/${siteId}/positions`, {
      name: 'Préparation',
      skillIds: [],
    });
    expect(created.status).toBe(201);
    const foreignCreation = await adminOfB.post(`/sites/${siteId}/positions`, {
      name: 'Cariste',
      skillIds: [],
    });
    const missingCreation = await adminOfB.post(`/sites/${UNKNOWN_ID}/positions`, {
      name: 'Cariste',
      skillIds: [],
    });
    expect(foreignCreation.status).toBe(404);
    expect(foreignCreation.body).toEqual({
      ...missingCreation.body,
      instance: foreignCreation.body.instance,
    });
    for (const suffix of ['', `/${created.body.id}`]) {
      const foreign = await adminOfB.get(`/sites/${siteId}/positions${suffix}`);
      const missing = await adminOfB.get(`/sites/${UNKNOWN_ID}/positions${suffix}`);
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual({ ...missing.body, instance: foreign.body.instance });
    }
    expect((await admin.get(`/sites/${siteId}/positions`)).body.items).toHaveLength(1);
  });

  it('ne permet pas de lire un poste via un autre site de la même organisation', async () => {
    const created = await admin.post(`/sites/${siteId}/positions`, {
      name: 'Préparation',
      skillIds: [],
    });
    expect(created.status).toBe(201);
    const otherSite = await admin.post('/sites', { code: 'MUL', name: 'Mulhouse' });
    expect(
      (await manager.get(`/sites/${otherSite.body.id}/positions/${created.body.id}`)).status,
    ).toBe(404);
  });

  it('ignore une organisation fournie dans le corps', async () => {
    const created = await admin.post(`/sites/${siteId}/positions`, {
      name: 'Cariste',
      skillIds: [],
      organizationId: testActors.adminOfB.organizationId,
    });
    expect(created.status).toBe(201);
    expect((await admin.get(`/sites/${siteId}/positions/${created.body.id}`)).status).toBe(200);
    expect((await adminOfB.get(`/sites/${siteId}/positions/${created.body.id}`)).status).toBe(404);
  });

  it('valide la pagination et les identifiants des chemins', async () => {
    expect((await manager.get(`/sites/${siteId}/positions?limit=101`)).status).toBe(400);
    expect((await manager.get(`/sites/${siteId}/positions?cursor=invalide`)).status).toBe(400);
    expect((await manager.get(`/sites/${siteId}/positions/invalide`)).status).toBe(404);
    expect((await manager.get('/sites/invalide/positions')).status).toBe(404);
    expect(
      (await admin.post('/sites/invalide/positions', { name: 'Cariste', skillIds: [] })).status,
    ).toBe(404);
  });

  it('BDD autorisations : protège les trois endpoints', async () => {
    const anonymous = new TestClient(app);
    const employee = new TestClient(app, testActors.employeeOfA);
    const collection = `/sites/${siteId}/positions`;
    const position = `${collection}/${UNKNOWN_ID}`;
    expect((await manager.post(collection, { name: 'Cariste', skillIds: [] })).status).toBe(403);
    expect((await employee.post(collection, { name: 'Cariste', skillIds: [] })).status).toBe(403);
    expect((await employee.get(collection)).status).toBe(403);
    expect((await employee.get(position)).status).toBe(403);
    expect((await anonymous.get(collection)).status).toBe(401);
    expect((await anonymous.get(position)).status).toBe(401);
    expect((await anonymous.post(collection, { name: 'Cariste', skillIds: [] })).status).toBe(401);
  });
});
