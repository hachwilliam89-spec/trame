import { InvalidSiteCodeError } from './site.errors';

/** Majuscules, chiffres et tirets, 20 caractères au plus, sans tiret au début. */
const SITE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,19}$/;

/**
 * Code court d'un site (`COL`, `LYS-2`), unique dans l'organisation.
 * Le contrat `createSiteRequestV1` reprend la même règle pour que le front valide avant l'envoi.
 */
export class SiteCode {
  private constructor(readonly value: string) {}

  static of(value: string): SiteCode {
    if (!SITE_CODE_PATTERN.test(value)) {
      throw new InvalidSiteCodeError(value);
    }
    return new SiteCode(value);
  }

  equals(other: SiteCode): boolean {
    return this.value === other.value;
  }
}
