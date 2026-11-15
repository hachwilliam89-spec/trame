import { z } from 'zod';
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
});
