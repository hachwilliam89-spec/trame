import { z } from 'zod';
import {
  absenceReasonV1,
  absenceRequestV1,
  absenceV1,
  weekAbsencesQueryV1,
  weekAbsencesV1,
} from './absence.v1';
import {
  employeeListQueryV1,
  employeePageV1,
  employeeQualificationV1,
  employeeV1,
} from './employee.v1';
import { employmentContractPageV1, employmentContractV1 } from './employment-contract.v1';

const exchangedSchemas = {
  employeeQualificationV1,
  employeeV1,
  employeeListQueryV1,
  employeePageV1,
  employmentContractV1,
  employmentContractPageV1,
  absenceReasonV1,
  absenceRequestV1,
  absenceV1,
  weekAbsencesQueryV1,
  weekAbsencesV1,
};

const SITE_ID = '0190f0a0-0000-7000-8000-0000000000d1';
const CACES_ID = '0190f0a0-0000-7000-8000-0000000000c3';

describe('contrats du contexte staff', () => {
  it('exporte chaque schéma échangé en JSON Schema (ADR-0018)', () => {
    for (const schema of Object.values(exchangedSchemas)) {
      expect(() => z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' })).not.toThrow();
    }
  });

  it('accepte une habilitation avec une date d’expiration, ou sans', () => {
    const dated = { skillId: CACES_ID, expiresOn: '2026-12-09' };
    const permanent = { skillId: CACES_ID, expiresOn: null };

    expect(employeeQualificationV1.safeParse(dated).success).toBe(true);
    expect(employeeQualificationV1.safeParse(permanent).success).toBe(true);
  });

  it.each(['09/12/2026', '2026-12-09T00:00:00Z', '2026-13-01', ''])(
    'refuse la date d’expiration %j : seul un jour ISO 8601 est admis',
    (expiresOn) => {
      const qualification = { skillId: CACES_ID, expiresOn };

      expect(employeeQualificationV1.safeParse(qualification).success).toBe(false);
    },
  );

  it('accepte un contrat de travail avec ou sans date de fin', () => {
    const contract = {
      id: '0190f0a0-0000-7000-8000-0000000000f1',
      employeeId: '0190f0a0-0000-7000-8000-0000000000e1',
      weeklyMinutesMin: 1680,
      weeklyMinutesMax: 2100,
      startsOn: '2026-01-01',
      endsOn: null,
      createdAt: '2026-11-15T08:00:00Z',
    };

    expect(employmentContractV1.safeParse(contract).success).toBe(true);
    expect(employmentContractV1.safeParse({ ...contract, endsOn: '2026-12-31' }).success).toBe(
      true,
    );
    expect(employmentContractV1.safeParse({ ...contract, weeklyMinutesMax: 35.5 }).success).toBe(
      false,
    );
  });

  it('exige le site pour lister les employés', () => {
    expect(employeeListQueryV1.safeParse({}).success).toBe(false);
    expect(employeeListQueryV1.safeParse({ siteId: 'entrepot' }).success).toBe(false);
  });

  it('lit la limite de page depuis la query string, avec le site', () => {
    const query = employeeListQueryV1.parse({ siteId: SITE_ID, limit: '2' });

    expect(query).toEqual({ siteId: SITE_ID, limit: 2 });
  });

  describe('absences (US-033)', () => {
    const tuesdayLeave = {
      startsAt: '2026-11-24T00:00:00+01:00',
      endsAt: '2026-11-26T00:00:00+01:00',
      reason: 'LEAVE',
    };

    it('accepte une période aux instants avec leur décalage, ou en UTC', () => {
      expect(absenceRequestV1.safeParse(tuesdayLeave).success).toBe(true);
      expect(
        absenceRequestV1.safeParse({
          ...tuesdayLeave,
          startsAt: '2026-11-25T23:00:00Z',
          endsAt: '2026-11-26T09:00:00Z',
        }).success,
      ).toBe(true);
    });

    it.each([
      ['des millisecondes', '2026-11-24T06:00:00.100Z'],
      ['des microsecondes', '2026-11-24T06:00:00.000100Z'],
      ['dix chiffres après la virgule', '2026-11-24T06:00:00.1234567890Z'],
      ['des secondes', '2026-11-24T06:00:30+01:00'],
      ['des minutes sans secondes', '2026-11-24T06:00+01:00'],
    ])('refuse un instant avec %s : une absence se saisit à la minute', (_case, startsAt) => {
      const result = absenceRequestV1.safeParse({ ...tuesdayLeave, startsAt });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['startsAt']);
    });

    it('propose quatre catégories de motif : congé, arrêt de travail, formation, autre', () => {
      expect(absenceReasonV1.options).toEqual(['LEAVE', 'SICK_LEAVE', 'TRAINING', 'OTHER']);
    });

    it('refuse un motif hors des catégories', () => {
      expect(absenceRequestV1.safeParse({ ...tuesdayLeave, reason: 'MALADIE' }).success).toBe(
        false,
      );
    });

    it('refuse tout champ libre : aucun détail ne peut accompagner le motif', () => {
      const withComment = { ...tuesdayLeave, comment: 'grippe' };

      expect(absenceRequestV1.safeParse(withComment).success).toBe(false);
    });

    it.each(['2026-11-24', '2026-11-24T00:00:00', '24/11/2026 06:00'])(
      'refuse l’instant %j : sans décalage, il n’a pas de sens hors du fuseau du site',
      (startsAt) => {
        expect(absenceRequestV1.safeParse({ ...tuesdayLeave, startsAt }).success).toBe(false);
      },
    );

    it('renvoie une absence avec ses instants en UTC', () => {
      const absence = {
        id: '0190f0a0-0000-7000-8000-0000000000a1',
        employeeId: '0190f0a0-0000-7000-8000-0000000000e1',
        startsAt: '2026-11-23T23:00:00Z',
        endsAt: '2026-11-25T23:00:00Z',
        reason: 'LEAVE',
        createdAt: '2026-11-18T15:00:00Z',
      };

      expect(absenceV1.safeParse(absence).success).toBe(true);
      expect(
        weekAbsencesV1.safeParse({
          siteId: SITE_ID,
          weekStartsOn: '2026-11-23',
          absences: [absence],
        }).success,
      ).toBe(true);
    });

    it('exige le site et le lundi de la semaine pour lister les absences', () => {
      expect(weekAbsencesQueryV1.safeParse({ siteId: SITE_ID }).success).toBe(false);
      expect(
        weekAbsencesQueryV1.safeParse({ siteId: SITE_ID, weekStartsOn: '2026-11-23' }).success,
      ).toBe(true);
    });
  });
});
