import { z } from 'zod';
import { coverageNeedV1, weeklyCoverageQueryV1, weeklyCoverageV1 } from './weekly-coverage.v1';

const exchangedSchemas = { coverageNeedV1, weeklyCoverageV1, weeklyCoverageQueryV1 };

const SITE_ID = '0190f0a0-0000-7000-8000-0000000000d1';
const need = {
  date: '2026-11-21',
  shiftTemplateId: '0190f0a0-0000-7000-8000-0000000000a1',
  positionId: '0190f0a0-0000-7000-8000-0000000000b1',
  requiredCount: 3,
};

describe('contrats du contexte demand', () => {
  it('exporte chaque schéma échangé en JSON Schema (ADR-0018)', () => {
    for (const schema of Object.values(exchangedSchemas)) {
      expect(() => z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' })).not.toThrow();
    }
  });

  it('accepte une semaine avec ses besoins, ou jamais définie', () => {
    const defined = {
      siteId: SITE_ID,
      weekStartsOn: '2026-11-16',
      needs: [need],
      updatedAt: '2026-11-15T08:00:00Z',
    };
    const neverDefined = { ...defined, needs: [], updatedAt: null };

    expect(weeklyCoverageV1.safeParse(defined).success).toBe(true);
    expect(weeklyCoverageV1.safeParse(neverDefined).success).toBe(true);
  });

  it.each([0, -1, 1.5])('refuse %j personnes requises', (requiredCount) => {
    expect(coverageNeedV1.safeParse({ ...need, requiredCount }).success).toBe(false);
  });

  it('exige le site et un jour ISO 8601 pour lire une semaine', () => {
    const valid = { siteId: SITE_ID, weekStartsOn: '2026-11-16' };

    expect(weeklyCoverageQueryV1.safeParse(valid).success).toBe(true);
    expect(weeklyCoverageQueryV1.safeParse({ siteId: SITE_ID }).success).toBe(false);
    expect(weeklyCoverageQueryV1.safeParse({ ...valid, weekStartsOn: '16/11/2026' }).success).toBe(
      false,
    );
  });
});
