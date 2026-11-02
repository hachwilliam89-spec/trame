import {
  ShiftBreak,
  ShiftTemplate,
  ShiftTemplateLabelAlreadyUsedError,
} from '@trame/api/organization/domain';
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
  /** `null` : créneau sans pause. */
  break: { start: Temporal.PlainTime; durationMinutes: number } | null;
}

/** Crée un créneau type sur un site de l'organisation. Son libellé est unique sur le site. */
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
      break: toShiftBreak(command.break),
      createdAt: this.clock.now(),
    });

    const labelIsTaken = await this.shiftTemplates.existsWithLabel(
      site.organizationId,
      site.id,
      shiftTemplate.label,
    );
    if (labelIsTaken) {
      throw new ShiftTemplateLabelAlreadyUsedError(shiftTemplate.label);
    }

    await this.shiftTemplates.add(shiftTemplate);
    return shiftTemplate;
  }
}

function toShiftBreak(input: CreateShiftTemplateCommand['break']): ShiftBreak | null {
  if (input === null) {
    return null;
  }
  return ShiftBreak.of(input.start, input.durationMinutes);
}
