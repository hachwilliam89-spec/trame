import { Skill } from './skill';
import { InvalidSkillNameError } from './skill.errors';

const properties = {
  id: 'skill-a',
  organizationId: 'org-a',
  name: 'CACES R489',
  createdAt: Temporal.Instant.from('2026-11-02T08:00:00Z'),
};

describe('Skill', () => {
  it('conserve son organisation, son identité et son instant de création', () => {
    expect(Skill.create(properties)).toMatchObject(properties);
  });

  it.each(['A', 'a'.repeat(100)])('accepte les bornes du nom : %j', (name) => {
    expect(Skill.create({ ...properties, name }).name).toBe(name);
  });

  it.each(['', ' \t\n', 'a'.repeat(101)])('refuse le nom invalide %j', (name) => {
    expect(() => Skill.create({ ...properties, name })).toThrow(InvalidSkillNameError);
  });
});
