import type { Position } from '@trame/api/organization/domain';
import type { PositionV1 } from '@trame/shared/contracts';

export function toPositionV1(position: Position): PositionV1 {
  return {
    id: position.id,
    siteId: position.siteId,
    name: position.name,
    skillIds: [...position.skillIds],
    // Même précision que le stockage Prisma, dès la réponse de création.
    createdAt: position.createdAt.toString({ fractionalSecondDigits: 3 }),
  };
}
