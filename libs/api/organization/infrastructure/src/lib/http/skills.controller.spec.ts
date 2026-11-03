import type { INestApplication } from '@nestjs/common';
import { TestClient, createOrganizationTestApp, testActors } from '../../testing';

const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';

describe('API des compétences (US-030 B)', () => {
  let app: INestApplication;
  let admin: TestClient;
  let manager: TestClient;
  let adminOfB: TestClient;

  beforeEach(async () => {
    app = await createOrganizationTestApp();
    admin = new TestClient(app, testActors.adminOfA);
    manager = new TestClient(app, testActors.managerOfA);
    adminOfB = new TestClient(app, testActors.adminOfB);
  });

  afterEach(async () => {
    await app.close();
  });

  it('BDD catalogue : crée puis consulte une compétence dans son organisation', async () => {
    const created = await admin.post('/skills', { name: 'CACES R489' });
    expect(created.status).toBe(201);
    const response = await manager.get(`/skills/${created.body.id}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(created.body);
    expect(response.body.name).toBe('CACES R489');
  });

  it('BDD catalogue : ignore une organisation fournie par le client', async () => {
    const created = await admin.post('/skills', {
      name: 'CACES R489',
      organizationId: testActors.adminOfB.organizationId,
    });
    expect(created.status).toBe(201);
    expect((await adminOfB.get('/skills')).body.items).toEqual([]);
    expect((await admin.get('/skills')).body.items).toHaveLength(1);
  });

  it('BDD pagination : parcourt son catalogue sans doublon ni ressource étrangère', async () => {
    for (const name of ['CACES R489', 'Réception', 'Préparation']) {
      expect((await admin.post('/skills', { name })).status).toBe(201);
    }
    await adminOfB.post('/skills', { name: 'Compétence de B' });
    const first = await manager.get('/skills?limit=2');
    expect(first.status).toBe(200);
    const second = await manager.get(`/skills?limit=2&cursor=${first.body.nextCursor}`);
    expect(first.body.items.map((skill: { name: string }) => skill.name)).toEqual([
      'CACES R489',
      'Réception',
    ]);
    expect(second.body.items.map((skill: { name: string }) => skill.name)).toEqual(['Préparation']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('accepte les noms identiques : aucune unicité métier ajoutée', async () => {
    expect((await admin.post('/skills', { name: 'CACES' })).status).toBe(201);
    expect((await admin.post('/skills', { name: 'CACES' })).status).toBe(201);
  });

  it.each(['', '   ', 'a'.repeat(101)])('refuse un nom invalide %j', async (name) => {
    const response = await admin.post('/skills', { name });
    expect(response.status).toBe(400);
    expect(response.body.errors).toContainEqual(expect.objectContaining({ pointer: '#/name' }));
  });

  it('BDD compétence inutilisée : supprime et retire la compétence du catalogue', async () => {
    const created = await admin.post('/skills', { name: 'Réception' });
    expect(created.status).toBe(201);
    const response = await admin.delete(`/skills/${created.body.id}`);
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect((await manager.get(`/skills/${created.body.id}`)).status).toBe(404);
    expect((await manager.get('/skills')).body.items).toEqual([]);
    expect((await admin.delete(`/skills/${created.body.id}`)).status).toBe(404);
  });

  it('BDD compétence utilisée : refuse la suppression et conserve le poste', async () => {
    const skill = await admin.post('/skills', { name: 'CACES R489' });
    expect(skill.status).toBe(201);
    const site = await admin.post('/sites', { code: 'COL', name: 'Colmar' });
    const position = await admin.post(`/sites/${site.body.id}/positions`, {
      name: 'Cariste',
      skillIds: [skill.body.id],
    });
    expect(position.status).toBe(201);
    const response = await admin.delete(`/skills/${skill.body.id}`);
    expect(response.status).toBe(409);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body.type).toBe('tag:wkhach.dev,2026-11-02:trame:problem:skill-in-use');
    expect((await manager.get(`/skills/${skill.body.id}`)).status).toBe(200);
    const reread = await manager.get(`/sites/${site.body.id}/positions/${position.body.id}`);
    expect(reread.body.skillIds).toEqual([skill.body.id]);
  });

  it.each(['get', 'delete'] as const)(
    'BDD accès croisé : %s renvoie le même 404 qu’une absence',
    async (method) => {
      const skill = await admin.post('/skills', { name: 'CACES' });
      expect(skill.status).toBe(201);
      const foreign = await adminOfB[method](`/skills/${skill.body.id}`);
      const missing = await adminOfB[method](`/skills/${UNKNOWN_ID}`);
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual({ ...missing.body, instance: foreign.body.instance });
      expect((await admin.get(`/skills/${skill.body.id}`)).status).toBe(200);
    },
  );

  it('répond 404 pour un identifiant mal formé et 400 pour une pagination invalide', async () => {
    expect((await admin.get('/skills/invalide')).status).toBe(404);
    expect((await admin.delete('/skills/invalide')).status).toBe(404);
    expect((await admin.get('/skills?limit=101')).status).toBe(400);
    expect((await admin.get('/skills?cursor=invalide')).status).toBe(400);
  });

  it.each([testActors.managerOfA, testActors.employeeOfA])(
    'BDD autorisations : %j ne peut pas écrire',
    async (actor) => {
      const client = new TestClient(app, actor);
      expect((await client.post('/skills', { name: 'CACES' })).status).toBe(403);
      expect((await client.delete(`/skills/${UNKNOWN_ID}`)).status).toBe(403);
    },
  );

  it('refuse les lectures à un employé et toutes les opérations à un anonyme', async () => {
    const employee = new TestClient(app, testActors.employeeOfA);
    const anonymous = new TestClient(app);
    expect((await employee.get('/skills')).status).toBe(403);
    expect((await employee.get(`/skills/${UNKNOWN_ID}`)).status).toBe(403);
    expect((await anonymous.get('/skills')).status).toBe(401);
    expect((await anonymous.get(`/skills/${UNKNOWN_ID}`)).status).toBe(401);
    expect((await anonymous.post('/skills', { name: 'CACES' })).status).toBe(401);
    expect((await anonymous.delete(`/skills/${UNKNOWN_ID}`)).status).toBe(401);
  });
});
