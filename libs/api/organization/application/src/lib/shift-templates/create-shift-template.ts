import { ShiftBreak, ShiftTemplate } from '@trame/api/organization/domain';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import type { ShiftTemplateRepository } from '../ports/shift-template.repository';
import type { SiteRepository } from '../ports/site.repository';
import { findSiteOrThrow } from '../sites/find-site';

export interface CreateShiftTemplateCommand {
  organizationId: string;
  siteId: string;
  label: string;
  /** Heures locales du site. */
  start: Temporal.PlainTime;
  end: Temporal.PlainTime;
  break: { start: Temporal.PlainTime; durationMinutes: number };
}

/** Crée un créneau type sur un site de l'organisation. */
export class CreateShiftTemplate {
  constructor(
    private readonly sites: SiteRepository,
    private readonly shiftTemplates: ShiftTemplateRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateShiftTemplateCommand): Promise<ShiftTemplate> {
    const site = await findSiteOrThrow(this.sites, command.organizationId, command.siteId);

    const shiftTemplate = ShiftTemplate.create({
      id: this.ids.next(),
      organizationId: site.organizationId,
      siteId: site.id,
      label: command.label,
      start: command.start,
      end: command.end,
      break: ShiftBreak.of(command.break.start, command.break.durationMinutes),
      createdAt: this.clock.now(),
    });

    await this.shiftTemplates.add(shiftTemplate);
    return shiftTemplate;
  }
}
