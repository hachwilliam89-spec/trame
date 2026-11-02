import { Position } from './position';
import { DuplicateRequiredSkillError, InvalidPositionNameError } from './position.errors';

const properties = {
  id: 'position-a',
  organizationId: 'org-a',
  siteId: 'site-a',
  name: 'Cariste',
  skillIds: ['skill-a'],
  createdAt: Temporal.Instant.from('2026-11-02T08:00:00Z'),
};

describe('Position', () => {
  it('conserve son site, son organisation et son instant de création', () => {
    expect(Position.create(properties)).toMatchObject(properties);
  });

  it('accepte un poste sans compétence requise', () => {
    expect(Position.create({ ...properties, skillIds: [] }).skillIds).toEqual([]);
  });

  it('expose une copie triée des compétences sans modifier la liste fournie', () => {
    const skillIds = ['skill-b', 'skill-a'];
    const position = Position.create({ ...properties, skillIds });
    expect(skillIds).toEqual(['skill-b', 'skill-a']);
    skillIds.push('skill-c');
    expect(position.skillIds).toEqual(['skill-a', 'skill-b']);
    expect(Object.isFrozen(position.skillIds)).toBe(true);
  });

  it('normalise les UUID avant de repérer les doublons', () => {
    const skillId = '0190f0a0-0000-7000-8000-0000000000af';
    expect(Position.create({ ...properties, skillIds: [skillId.toUpperCase()] }).skillIds).toEqual([
      skillId,
    ]);
    expect(() =>
      Position.create({ ...properties, skillIds: [skillId, skillId.toUpperCase()] }),
    ).toThrow(DuplicateRequiredSkillError);
  });

  it.each(['', ' \t\n', 'a'.repeat(101), 'Cariste\u0000'])('refuse le nom invalide %j', (name) => {
    expect(() => Position.create({ ...properties, name })).toThrow(InvalidPositionNameError);
  });

  it.each(['A', 'a'.repeat(100)])('accepte les bornes du nom : %j', (name) => {
    expect(Position.create({ ...properties, name }).name).toBe(name);
  });
});
