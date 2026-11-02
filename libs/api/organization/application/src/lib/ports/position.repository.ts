import type { Position } from '@trame/api/organization/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';

/** Postes enregistrés. Chaque lecture est limitée à une organisation et à un site. */
export interface PositionRepository {
  /**
   * Enregistre le poste et ses compétences requises en une seule transaction. Lève
   * `PositionReferenceNotFoundError`, sans rien enregistrer, si le site ou une compétence a
   * disparu entre la vérification du use case et l'écriture.
   */
  add(position: Position): Promise<void>;

  /** `undefined` si le poste n'existe pas pour ce site dans cette organisation. */
  findById(
    organizationId: string,
    siteId: string,
    positionId: string,
  ): Promise<Position | undefined>;

  /** Postes du site, par ordre de création. */
  listBySite(organizationId: string, siteId: string, page: PageRequest): Promise<Page<Position>>;

  /** Vrai si au moins un poste de l'organisation exige cette compétence. */
  isSkillRequired(organizationId: string, skillId: string): Promise<boolean>;
}
