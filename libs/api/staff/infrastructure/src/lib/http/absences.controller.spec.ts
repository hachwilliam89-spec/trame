import type { INestApplication } from '@nestjs/common';
import type { Employee } from '@trame/api/staff/domain';
import type { Actor } from '@trame/platform/auth';
import {
  ORGANIZATION_A,
  type StaffTestApp,
  createStaffTestApp,
  sendAs,
  testActors,
} from '../../testing/staff-test-app';

const WAREHOUSE_OF_A = '0190f0a0-0000-7000-8000-0000000000d1';
const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';
const WEEK_OF_23_NOVEMBER = `/absences?siteId=${WAREHOUSE_OF_A}&weekStartsOn=2026-11-23`;

/** Inès Fabre en congé le mardi 24 et le mercredi 25 novembre 2026, journées entières à Paris. */
const tuesdayAndWednesday = {
  startsAt: '2026-11-24T00:00:00+01:00',
  endsAt: '2026-11-26T00:00:00+01:00',
  reason: 'LEAVE',
};

/** `instance` reprend le chemin demandé : c'est le seul champ qui distingue deux réponses 404. */
function withoutInstance(problem: Record<string, unknown>): Record<string, unknown> {
  return { ...problem, instance: undefined };
}

describe('API des absences (US-033, jalon 2)', () => {
  let testApp: StaffTestApp;
  let app: INestApplication;
  let ines: Employee;

  beforeEach(async () => {
    testApp = await createStaffTestApp();
    app = testApp.app;
    testApp.catalog.addSite(ORGANIZATION_A, WAREHOUSE_OF_A, 'Europe/Paris');
    ines = await testApp.createEmployee.execute({
      organizationId: ORGANIZATION_A,
      siteId: WAREHOUSE_OF_A,
      firstName: 'Inès',
      lastName: 'Fabre',
      qualifications: [],
    });
  });
  afterEach(async () => {
    await app.close();
  });

  function absencesOf(employeeId: string): string {
    return `/employees/${employeeId}/absences`;
  }

  async function declare(actor: Actor = testActors.managerOfA, body: object = tuesdayAndWednesday) {
    return sendAs(app, actor, 'post', absencesOf(ines.id), body);
  }

  describe('déclarer', () => {
    it('BDD : enregistre l’absence et la renvoie, ses instants en UTC', async () => {
      const response = await declare();

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(String),
        employeeId: ines.id,
        startsAt: '2026-11-23T23:00:00Z',
        endsAt: '2026-11-25T23:00:00Z',
        reason: 'LEAVE',
        createdAt: '2026-11-15T08:00:00Z',
      });
    });

    it('BDD : refuse une période dont la fin précède le début, avec un pointeur vers la fin', async () => {
      const response = await declare(testActors.managerOfA, {
        ...tuesdayAndWednesday,
        startsAt: '2026-11-26T00:00:00+01:00',
        endsAt: '2026-11-24T00:00:00+01:00',
      });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([
        expect.objectContaining({
          pointer: '#/endsAt',
          code: 'invalid_absence_period',
          detail: 'La fin doit suivre le début.',
        }),
      ]);
    });

    it('BDD : refuse un champ libre à côté du motif, et un motif hors des catégories', async () => {
      const withComment = await declare(testActors.managerOfA, {
        ...tuesdayAndWednesday,
        comment: 'grippe',
      });
      const unknownReason = await declare(testActors.managerOfA, {
        ...tuesdayAndWednesday,
        reason: 'MALADIE',
      });

      expect(withComment.status).toBe(400);
      expect(unknownReason.status).toBe(400);
      expect(unknownReason.body.errors).toContainEqual(
        expect.objectContaining({ pointer: '#/reason' }),
      );
    });

    it('accepte l’administrateur', async () => {
      expect((await declare(testActors.adminOfA)).status).toBe(201);
    });
  });

  describe('lister les absences d’une semaine', () => {
    it('renvoie les absences du site qui touchent la semaine', async () => {
      const declared = await declare();

      const response = await sendAs(app, testActors.managerOfA, 'get', WEEK_OF_23_NOVEMBER);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        siteId: WAREHOUSE_OF_A,
        weekStartsOn: '2026-11-23',
        absences: [declared.body],
      });
    });

    it('refuse une semaine qui ne commence pas un lundi', async () => {
      const response = await sendAs(
        app,
        testActors.managerOfA,
        'get',
        `/absences?siteId=${WAREHOUSE_OF_A}&weekStartsOn=2026-11-24`,
      );

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([
        expect.objectContaining({ pointer: '#/weekStartsOn', code: 'invalid_week_start' }),
      ]);
    });

    it('exige le site et la semaine', async () => {
      const response = await sendAs(app, testActors.managerOfA, 'get', '/absences');

      expect(response.status).toBe(400);
    });
  });

  describe('modifier et supprimer', () => {
    it('déplace une absence et change son motif', async () => {
      const declared = await declare();

      const response = await sendAs(
        app,
        testActors.managerOfA,
        'put',
        `${absencesOf(ines.id)}/${declared.body.id}`,
        {
          startsAt: '2026-11-27T00:00:00+01:00',
          endsAt: '2026-11-28T00:00:00+01:00',
          reason: 'SICK_LEAVE',
        },
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ...declared.body,
        startsAt: '2026-11-26T23:00:00Z',
        endsAt: '2026-11-27T23:00:00Z',
        reason: 'SICK_LEAVE',
      });
    });

    it('BDD : supprime une absence saisie par erreur', async () => {
      const declared = await declare();
      const path = `${absencesOf(ines.id)}/${declared.body.id}`;

      const deleted = await sendAs(app, testActors.managerOfA, 'delete', path);
      const deletedAgain = await sendAs(app, testActors.managerOfA, 'delete', path);
      const week = await sendAs(app, testActors.managerOfA, 'get', WEEK_OF_23_NOVEMBER);

      expect(deleted.status).toBe(204);
      expect(deletedAgain.status).toBe(404);
      expect(week.body.absences).toEqual([]);
    });
  });

  describe('BDD isolation : une autre organisation ne voit ni ne touche aucune absence', () => {
    it('ne peut pas déclarer une absence d’Inès Fabre, comme pour un employé absent', async () => {
      const foreign = await sendAs(
        app,
        testActors.managerOfB,
        'post',
        absencesOf(ines.id),
        tuesdayAndWednesday,
      );
      const missing = await sendAs(
        app,
        testActors.managerOfB,
        'post',
        absencesOf(UNKNOWN_ID),
        tuesdayAndWednesday,
      );

      expect(foreign.status).toBe(404);
      expect(withoutInstance(foreign.body)).toEqual(withoutInstance(missing.body));
    });

    it('ne peut ni modifier ni supprimer une absence d’Inès Fabre', async () => {
      const declared = await declare();
      const path = `${absencesOf(ines.id)}/${declared.body.id}`;

      const updated = await sendAs(app, testActors.managerOfB, 'put', path, tuesdayAndWednesday);
      const deleted = await sendAs(app, testActors.managerOfB, 'delete', path);
      const week = await sendAs(app, testActors.managerOfA, 'get', WEEK_OF_23_NOVEMBER);

      expect(updated.status).toBe(404);
      expect(deleted.status).toBe(404);
      expect(week.body.absences).toEqual([declared.body]);
    });

    it('ne peut pas lire les absences du site, comme pour un site absent', async () => {
      await declare();

      const foreign = await sendAs(app, testActors.managerOfB, 'get', WEEK_OF_23_NOVEMBER);
      const missing = await sendAs(
        app,
        testActors.managerOfB,
        'get',
        `/absences?siteId=${UNKNOWN_ID}&weekStartsOn=2026-11-23`,
      );

      expect(foreign.status).toBe(404);
      expect(withoutInstance(foreign.body)).toEqual(withoutInstance(missing.body));
    });
  });

  it('traite un identifiant mal formé comme une ressource absente', async () => {
    const malformedEmployee = await sendAs(
      app,
      testActors.managerOfA,
      'post',
      absencesOf('ines'),
      tuesdayAndWednesday,
    );
    const malformedAbsence = await sendAs(
      app,
      testActors.managerOfA,
      'delete',
      `${absencesOf(ines.id)}/absence`,
    );

    expect(malformedEmployee.status).toBe(404);
    expect(malformedAbsence.status).toBe(404);
  });

  it('refuse un employé, qui ne gère pas les absences, et un anonyme', async () => {
    const declared = await declare();
    const absencePath = `${absencesOf(ines.id)}/${declared.body.id}`;
    const requests = [
      ['post', absencesOf(ines.id), tuesdayAndWednesday],
      ['put', absencePath, tuesdayAndWednesday],
      ['delete', absencePath, undefined],
      ['get', WEEK_OF_23_NOVEMBER, undefined],
    ] as const;

    for (const [method, path, body] of requests) {
      expect((await sendAs(app, testActors.employeeOfA, method, path, body)).status).toBe(403);
      expect((await sendAs(app, undefined, method, path, body)).status).toBe(401);
    }
  });
});
