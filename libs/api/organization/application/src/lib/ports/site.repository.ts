import type { Site, SiteCode } from '@trame/api/organization/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';

/** Sites enregistrés. Chaque lecture est limitée à une organisation (AGENTS.md, règle 9). */
export interface SiteRepository {
  /**
   * Enregistre un nouveau site. Lève `SiteCodeAlreadyUsedError` si un autre site a pris ce code
   * entre la vérification du use case et l'enregistrement (deux créations simultanées).
   */
  add(site: Site): Promise<void>;

  existsWithCode(organizationId: string, code: SiteCode): Promise<boolean>;

  /** `undefined` si le site n'existe pas dans cette organisation. */
  findById(organizationId: string, siteId: string): Promise<Site | undefined>;

  /** Sites de l'organisation, par ordre de création. */
  list(organizationId: string, page: PageRequest): Promise<Page<Site>>;
}
