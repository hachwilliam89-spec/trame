import { InvalidSkillNameError } from './skill.errors';

export interface SkillProperties {
  id: string;
  organizationId: string;
  name: string;
  createdAt: Temporal.Instant;
}

/** Compétence du catalogue d'une organisation, partagée par ses sites. */
export class Skill {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly createdAt: Temporal.Instant;

  private constructor(properties: SkillProperties) {
    this.id = properties.id;
    this.organizationId = properties.organizationId;
    this.name = properties.name;
    this.createdAt = properties.createdAt;
  }

  static create(properties: SkillProperties): Skill {
    if (
      properties.name.trim() === '' ||
      properties.name.length > 100 ||
      properties.name.includes('\0')
    ) {
      throw new InvalidSkillNameError();
    }
    return new Skill(properties);
  }
}
