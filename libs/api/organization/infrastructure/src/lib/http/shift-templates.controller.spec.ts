import type { INestApplication } from '@nestjs/common';
import {
  problemTypes,
  shiftDurationsV1,
  shiftTemplatePageV1,
  shiftTemplateV1,
} from '@trame/shared/contracts';
import { TestClient, createOrganizationTestApp, testActors } from '../../testing';

const night = {
  label: 'Nuit',
  startTime: '22:00',
  endTime: '06:00',
  break: { startTime: '02:00', durationMinutes: 30 },
};
const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';

describe('API des créneaux types', () => {
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

    const site = await admin.post('/sites', {
      code: 'COL',
      name: 'Colmar',
      timeZone: 'Europe/Paris',
    });
    siteId = site.body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /sites/:siteId/shift-templates', () => {
    it('crée un créneau de nuit conforme au contrat', async () => {
      const response = await admin.post(`/sites/${siteId}/shift-templates`, night);

      expect(response.status).toBe(201);
      expect(shiftTemplateV1.parse(response.body)).toMatchObject({
        siteId,
        ...night,
        crossesMidnight: true,
      });
    });

    it('crée un créneau sans pause', async () => {
      const morning = { label: 'Matin', startTime: '06:00', endTime: '14:00', break: null };

      const response = await admin.post(`/sites/${siteId}/shift-templates`, morning);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ break: null, crossesMidnight: false });
    });

    it('refuse une pause hors du créneau, avec un pointeur vers la pause', async () => {
      const response = await admin.post(`/sites/${siteId}/shift-templates`, {
        ...night,
        break: { startTime: '07:00', durationMinutes: 30 },
      });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([
        expect.objectContaining({ pointer: '#/break', code: 'break_outside_shift' }),
      ]);
    });

    it("refuse un créneau qui finit à l'heure où il commence", async () => {
      const response = await admin.post(`/sites/${siteId}/shift-templates`, {
        ...night,
        endTime: '22:00',
        break: null,
      });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([expect.objectContaining({ pointer: '#/endTime' })]);
    });

    it('refuse une heure mal formée', async () => {
      const response = await admin.post(`/sites/${siteId}/shift-templates`, {
        ...night,
        startTime: '24:00',
      });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([expect.objectContaining({ pointer: '#/startTime' })]);
    });

    it('répond 409 quand le libellé est déjà utilisé sur le site', async () => {
      await admin.post(`/sites/${siteId}/shift-templates`, night);

      const response = await admin.post(`/sites/${siteId}/shift-templates`, night);

      expect(response.status).toBe(409);
      expect(response.body.type).toBe(problemTypes.shiftTemplateLabelAlreadyUsed);
    });

    it("accès croisé : répond 404 sur le site d'une autre organisation", async () => {
      const response = await adminOfB.post(`/sites/${siteId}/shift-templates`, night);

      expect(response.status).toBe(404);
    });

    it('refuse un manager (403)', async () => {
      expect((await manager.post(`/sites/${siteId}/shift-templates`, night)).status).toBe(403);
    });
  });

  describe('GET /sites/:siteId/shift-templates', () => {
    it('liste les créneaux du site', async () => {
      await admin.post(`/sites/${siteId}/shift-templates`, night);

      const response = await manager.get(`/sites/${siteId}/shift-templates`);

      expect(shiftTemplatePageV1.parse(response.body).items.map((item) => item.label)).toEqual([
        'Nuit',
      ]);
    });

    it("accès croisé : répond 404 sur le site d'une autre organisation, plutôt qu'une liste vide", async () => {
      await admin.post(`/sites/${siteId}/shift-templates`, night);

      expect((await adminOfB.get(`/sites/${siteId}/shift-templates`)).status).toBe(404);
    });
  });

  describe('GET /sites/:siteId/shift-templates/:shiftTemplateId/durations', () => {
    let shiftTemplateId: string;

    beforeEach(async () => {
      const created = await admin.post(`/sites/${siteId}/shift-templates`, night);
      shiftTemplateId = created.body.id;
    });

    // Scénario : Créneau de nuit au changement d'heure (US-030).
    it("la nuit du passage à l'heure d'hiver, l'amplitude vaut 9 h et le temps effectif 8 h 30", async () => {
      const response = await manager.get(
        `/sites/${siteId}/shift-templates/${shiftTemplateId}/durations?date=2026-10-24`,
      );

      expect(response.status).toBe(200);
      expect(shiftDurationsV1.parse(response.body)).toEqual({
        date: '2026-10-24',
        startsAt: '2026-10-24T20:00:00Z',
        endsAt: '2026-10-25T05:00:00Z',
        amplitudeMinutes: 540,
        effectiveMinutes: 510,
      });
    });

    it('refuse une date absente ou mal formée', async () => {
      const path = `/sites/${siteId}/shift-templates/${shiftTemplateId}/durations`;

      expect((await manager.get(path)).status).toBe(400);
      expect((await manager.get(`${path}?date=2026-02-30`)).status).toBe(400);
    });

    it('répond 404 pour un créneau absent', async () => {
      const response = await manager.get(
        `/sites/${siteId}/shift-templates/${UNKNOWN_ID}/durations?date=2026-10-24`,
      );

      expect(response.status).toBe(404);
    });

    it("accès croisé : répond 404 pour le créneau d'une autre organisation", async () => {
      const response = await adminOfB.get(
        `/sites/${siteId}/shift-templates/${shiftTemplateId}/durations?date=2026-10-24`,
      );

      expect(response.status).toBe(404);
    });

    it("répond 404 quand le créneau appartient à un autre site de l'organisation", async () => {
      const otherSite = await admin.post('/sites', {
        code: 'LYS',
        name: 'Lyon',
        timeZone: 'Europe/Paris',
      });

      const response = await manager.get(
        `/sites/${otherSite.body.id}/shift-templates/${shiftTemplateId}/durations?date=2026-10-24`,
      );

      expect(response.status).toBe(404);
    });
  });
});
