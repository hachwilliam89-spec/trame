import { Site, SiteCode, SiteCodeAlreadyUsedError, TimeZone } from '@trame/api/organization/domain';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import type { SiteRepository } from '../ports/site.repository';

export interface CreateSiteCommand {
  organizationId: string;
  code: string;
  name: string;
  timeZone: string;
}

/** Crée un site. Règle métier : un code de site est unique dans l'organisation. */
export class CreateSite {
  constructor(
    private readonly sites: SiteRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateSiteCommand): Promise<Site> {
    const site = Site.create({
      id: this.ids.next(),
      organizationId: command.organizationId,
      code: SiteCode.of(command.code),
      name: command.name,
      timeZone: TimeZone.of(command.timeZone),
      createdAt: this.clock.now(),
    });

    const codeIsTaken = await this.sites.existsWithCode(command.organizationId, site.code);
    if (codeIsTaken) {
      throw new SiteCodeAlreadyUsedError(site.code.value);
    }

    await this.sites.add(site);
    return site;
  }
}
