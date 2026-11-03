import { Position } from '@trame/api/organization/domain';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import { SkillNotFoundError } from '../not-found.errors';
import type { PositionRepository } from '../ports/position.repository';
import type { SiteRepository } from '../ports/site.repository';
import type { SkillRepository } from '../ports/skill.repository';
import { findSiteOrThrow } from '../sites/find-site';

export interface CreatePositionCommand {
  organizationId: string;
  siteId: string;
  name: string;
  skillIds: readonly string[];
}

/**
 * Crée un poste sur un site de l'organisation, avec ses compétences requises. Une compétence
 * absente ou d'une autre organisation donne la même erreur « introuvable ».
 */
export class CreatePosition {
  constructor(
    private readonly sites: SiteRepository,
    private readonly skills: SkillRepository,
    private readonly positions: PositionRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreatePositionCommand): Promise<Position> {
    await findSiteOrThrow(this.sites, command.organizationId, command.siteId);
    const position = Position.create({
      ...command,
      id: this.ids.next(),
      createdAt: this.clock.now(),
    });
    const skillsExist = await this.skills.allExist(command.organizationId, position.skillIds);
    if (!skillsExist) {
      throw new SkillNotFoundError();
    }
    await this.positions.add(position);
    return position;
  }
}
