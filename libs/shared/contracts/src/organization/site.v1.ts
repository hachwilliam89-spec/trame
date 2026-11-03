import { z } from 'zod';
import { pageOfV1 } from '../common/page.v1';
import { requiredText } from '../common/text.v1';

/**
 * Code court d'un site, unique dans l'organisation : majuscules, chiffres et tirets, 20 caractères au plus.
 * Le domaine applique la même règle (`SiteCode`) ; le contrat la reprend pour que le front valide avant l'envoi.
 */
const siteCode = z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/);

/** Création d'un site : `POST /api/v1/sites`. */
export const createSiteRequestV1 = z.object({
  code: siteCode,
  name: requiredText(100),
  /** Fuseau IANA du site. Le domaine vérifie qu'il existe. */
  timeZone: z.string().min(1).max(64).default('Europe/Paris'),
});

export type CreateSiteRequestV1 = z.infer<typeof createSiteRequestV1>;

/** Un site, tel que l'API le renvoie. */
export const siteV1 = z.object({
  id: z.uuid(),
  code: siteCode,
  name: z.string(),
  timeZone: z.string(),
  createdAt: z.iso.datetime(),
});

export type SiteV1 = z.infer<typeof siteV1>;

/** Liste des sites : `GET /api/v1/sites`. */
export const sitePageV1 = pageOfV1(siteV1);

export type SitePageV1 = z.infer<typeof sitePageV1>;
