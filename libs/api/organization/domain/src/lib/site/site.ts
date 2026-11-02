import type { SiteCode } from './site-code';
import { BlankSiteNameError } from './site.errors';
import type { TimeZone } from './time-zone';

export interface SiteProperties {
  id: string;
  organizationId: string;
  code: SiteCode;
  name: string;
  timeZone: TimeZone;
  createdAt: Temporal.Instant;
}

/** Site d'une organisation : un entrepôt, avec son fuseau horaire. */
export class Site {
  readonly id: string;
  readonly organizationId: string;
  readonly code: SiteCode;
  readonly name: string;
  readonly timeZone: TimeZone;
  readonly createdAt: Temporal.Instant;

  private constructor(properties: SiteProperties) {
    this.id = properties.id;
    this.organizationId = properties.organizationId;
    this.code = properties.code;
    this.name = properties.name;
    this.timeZone = properties.timeZone;
    this.createdAt = properties.createdAt;
  }

  /**
   * Construit un site valide, nouveau ou relu en base. L'unicité du code se vérifie parmi les
   * autres sites : c'est le rôle du use case.
   */
  static create(properties: SiteProperties): Site {
    if (properties.name.trim() === '') {
      throw new BlankSiteNameError();
    }
    return new Site(properties);
  }
}
