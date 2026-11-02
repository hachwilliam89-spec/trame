import { Position, Skill } from '@trame/api/organization/domain';
import { toPositionV1 } from './position-presenter';
import { toSkillV1 } from './skill-presenter';

describe('dates du catalogue exposées par HTTP', () => {
  const properties = {
    id: '00000000-0000-7000-8000-000000000001',
    organizationId: 'org-a',
    name: 'Réception',
    createdAt: Temporal.Instant.from('2026-11-02T08:00:00.123987654Z'),
  };
  const storedInstant = Temporal.Instant.from('2026-11-02T08:00:00.123Z');

  it('rend la même compétence avant et après la perte de précision imposée par Prisma', () => {
    const created = Skill.create(properties);
    const reread = Skill.create({ ...properties, createdAt: storedInstant });

    expect(toSkillV1(created)).toEqual(toSkillV1(reread));
    expect(toSkillV1(created).createdAt).toBe('2026-11-02T08:00:00.123Z');
  });

  it('rend le même poste avant et après son stockage à la milliseconde', () => {
    const created = Position.create({ ...properties, siteId: 'site-a', skillIds: [] });
    const reread = Position.create({ ...created, createdAt: storedInstant });

    expect(toPositionV1(created)).toEqual(toPositionV1(reread));
    expect(toPositionV1(created).createdAt).toBe('2026-11-02T08:00:00.123Z');
  });
});
