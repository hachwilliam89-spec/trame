import type { Skill } from '@trame/api/organization/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';

/** Catalogue des compétences. Chaque lecture et chaque suppression sont limitées à une organisation. */
export interface SkillRepository {
  add(skill: Skill): Promise<void>;

  /** `undefined` si la compétence n'existe pas dans cette organisation. */
  findById(organizationId: string, skillId: string): Promise<Skill | undefined>;

  /** Compétences de l'organisation, par ordre de création. */
  list(organizationId: string, page: PageRequest): Promise<Page<Skill>>;

  /** Vrai si chacune de ces compétences existe dans l'organisation. */
  allExist(organizationId: string, skillIds: readonly string[]): Promise<boolean>;

  /**
   * Supprime la compétence ; `false` si elle n'existe pas dans l'organisation. Lève
   * `SkillInUseError` si un poste l'a exigée entre la vérification du use case et la suppression.
   */
  remove(organizationId: string, skillId: string): Promise<boolean>;
}
