import { DuplicateRequiredSkillError, InvalidPositionNameError } from './position.errors';

export interface PositionProperties {
  id: string;
  organizationId: string;
  siteId: string;
  name: string;
  skillIds: readonly string[];
  createdAt: Temporal.Instant;
}

/** Poste d'un site ; la liste des compétences représente un ensemble sans ordre métier. */
export class Position {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly name: string;
  readonly skillIds: readonly string[];
  readonly createdAt: Temporal.Instant;

  private constructor(properties: PositionProperties) {
    this.id = properties.id;
    this.organizationId = properties.organizationId;
    this.siteId = properties.siteId;
    this.name = properties.name;
    this.skillIds = Object.freeze([...properties.skillIds]);
    this.createdAt = properties.createdAt;
  }

  static create(properties: PositionProperties): Position {
    if (
      properties.name.trim() === '' ||
      properties.name.length > 100 ||
      properties.name.includes('\0')
    ) {
      throw new InvalidPositionNameError();
    }
    // PostgreSQL compare les UUID sans tenir compte de la casse. Le domaine fait de même.
    const skillIds = properties.skillIds.map((skillId) => skillId.toLowerCase()).toSorted();
    if (new Set(skillIds).size !== skillIds.length) {
      throw new DuplicateRequiredSkillError();
    }
    return new Position({ ...properties, skillIds });
  }
}
