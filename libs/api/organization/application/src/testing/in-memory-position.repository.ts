import type { Position } from '@trame/api/organization/domain';
import { type Page, type PageRequest, pageOf } from '@trame/platform/pagination';
import type { PositionRepository } from '../lib/ports/position.repository';

/** Dépôt en mémoire, pour les tests. */
export class InMemoryPositionRepository implements PositionRepository {
  private readonly positions: Position[] = [];

  async add(position: Position): Promise<void> {
    this.positions.push(position);
  }

  async findById(
    organizationId: string,
    siteId: string,
    positionId: string,
  ): Promise<Position | undefined> {
    return this.positions.find(
      (position) =>
        position.organizationId === organizationId &&
        position.siteId === siteId &&
        position.id === positionId,
    );
  }

  async listBySite(
    organizationId: string,
    siteId: string,
    page: PageRequest,
  ): Promise<Page<Position>> {
    const matching = this.positions.filter(
      (position) => position.organizationId === organizationId && position.siteId === siteId,
    );
    return pageOf(matching, page);
  }

  async isSkillRequired(organizationId: string, skillId: string): Promise<boolean> {
    // Les identifiants des postes sont en minuscules (domaine) ; PostgreSQL compare les UUID sans casse.
    const normalizedSkillId = skillId.toLowerCase();
    return this.positions.some(
      (position) =>
        position.organizationId === organizationId && position.skillIds.includes(normalizedSkillId),
    );
  }
}
