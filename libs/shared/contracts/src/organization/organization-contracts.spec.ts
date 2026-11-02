import { z } from 'zod';
import { createSkillRequestV1, skillV1, skillPageV1 } from './skill.v1';
import { createPositionRequestV1, positionV1, positionPageV1 } from './position.v1';
import { pageQueryV1 } from '../common/page.v1';
import { problemTypes } from '../problem-types';
import {
  createShiftTemplateRequestV1,
  shiftDurationsQueryV1,
  shiftDurationsV1,
  shiftTemplatePageV1,
} from './shift-template.v1';
import { createSiteRequestV1, sitePageV1 } from './site.v1';

const exchangedSchemas = {
  createSkillRequestV1,
  skillV1,
  skillPageV1,
  createPositionRequestV1,
  positionV1,
  positionPageV1,
  createSiteRequestV1,
  sitePageV1,
  createShiftTemplateRequestV1,
  shiftTemplatePageV1,
  shiftDurationsQueryV1,
  shiftDurationsV1,
  pageQueryV1,
};

describe('contrats du contexte organization', () => {
  it.each(['', '   ', 'a'.repeat(101), 'CACES\u0000R489'])(
    'refuse les noms invalides du catalogue : %j',
    (name) => {
      expect(createSkillRequestV1.safeParse({ name }).success).toBe(false);
      expect(createPositionRequestV1.safeParse({ name, skillIds: [] }).success).toBe(false);
    },
  );

  it('refuse le caractère NUL dans tout texte saisi : PostgreSQL ne peut pas le stocker', () => {
    const night = {
      label: 'Nu\u0000it',
      startTime: '22:00',
      endTime: '06:00',
      break: { startTime: '02:00', durationMinutes: 30 },
    };

    expect(createSiteRequestV1.safeParse({ code: 'COL', name: 'Col\u0000mar' }).success).toBe(
      false,
    );
    expect(createShiftTemplateRequestV1.safeParse(night).success).toBe(false);
  });

  it('exige une liste de compétences composée d’UUID, éventuellement vide', () => {
    expect(createPositionRequestV1.safeParse({ name: 'Préparation', skillIds: [] }).success).toBe(
      true,
    );
    expect(createPositionRequestV1.safeParse({ name: 'Préparation' }).success).toBe(false);
    expect(
      createPositionRequestV1.safeParse({ name: 'Préparation', skillIds: ['invalide'] }).success,
    ).toBe(false);
  });
  it.each(Object.entries(exchangedSchemas))(
    '%s est exportable en JSON Schema (ADR-0018)',
    (_name, schema) => {
      expect(() => z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' })).not.toThrow();
    },
  );

  it('applique le fuseau par défaut Europe/Paris', () => {
    expect(createSiteRequestV1.parse({ code: 'COL', name: 'Colmar' }).timeZone).toBe(
      'Europe/Paris',
    );
  });

  it.each(['col', '-COL', 'COLMAR-ENTREPOT-NORD-2', ''])('refuse le code de site %j', (code) => {
    expect(createSiteRequestV1.safeParse({ code, name: 'Colmar' }).success).toBe(false);
  });

  it('accepte un créneau de nuit avec sa pause, et refuse un créneau sans pause (US-030)', () => {
    const night = {
      label: 'Nuit',
      startTime: '22:00',
      endTime: '06:00',
      break: { startTime: '02:00', durationMinutes: 30 },
    };

    expect(createShiftTemplateRequestV1.safeParse(night).success).toBe(true);
    expect(createShiftTemplateRequestV1.safeParse({ ...night, break: null }).success).toBe(false);
    expect(createShiftTemplateRequestV1.safeParse({ ...night, break: undefined }).success).toBe(
      false,
    );
  });

  it.each(['24:00', '7:00', '22:00:00', '22h00'])("refuse l'heure %j", (startTime) => {
    const template = {
      label: 'Nuit',
      startTime,
      endTime: '06:00',
      break: { startTime: '02:00', durationMinutes: 30 },
    };

    expect(createShiftTemplateRequestV1.safeParse(template).success).toBe(false);
  });

  it('lit la limite de page depuis la query string', () => {
    expect(pageQueryV1.parse({ limit: '20' })).toEqual({ limit: 20 });
    expect(pageQueryV1.parse({})).toEqual({ limit: 50 });
    expect(pageQueryV1.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('nomme les types de problème par des URI tag: (RFC 4151)', () => {
    for (const type of Object.values(problemTypes)) {
      expect(type).toMatch(/^tag:[a-z0-9.-]+,\d{4}-\d{2}-\d{2}:trame:problem:[a-z-]+$/);
    }
  });
});
