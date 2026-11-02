import type { Position } from '@trame/api/organization/domain';
import { type Page, type PageRequest, pageOf } from '@trame/platform/pagination';
import type { PositionRepository } from '../lib/ports/position.repository';

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

  /** Simule la relation qui interdit de supprimer une compétence utilisée dans la vraie base. */
  usesSkill(organizationId: string, skillId: string): boolean {
    return this.positions.some(
      (position) =>
        position.organizationId === organizationId && position.skillIds.includes(skillId),
    );
  }
}
