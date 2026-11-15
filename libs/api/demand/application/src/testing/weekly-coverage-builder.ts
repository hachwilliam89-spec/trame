import { WeeklyCoverage, type WeeklyCoverageProperties } from '@trame/api/demand/domain';

/**
 * Monteur de données de test (US-050). Par défaut : la semaine du lundi 16 novembre 2026, sans
 * besoin. `aWeeklyCoverage().needing(3, '2026-11-21', morningId, forkliftDriverId).build()`.
 */
export class WeeklyCoverageBuilder {
  private properties: WeeklyCoverageProperties = {
    organizationId: '0190f0a0-0000-7000-8000-00000000000a',
    siteId: '0190f0a0-0000-7000-8000-0000000000d1',
    weekStartsOn: Temporal.PlainDate.from('2026-11-16'),
    needs: [],
    updatedAt: Temporal.Instant.from('2026-11-15T08:00:00Z'),
  };

  inOrganization(organizationId: string): this {
    this.properties = { ...this.properties, organizationId };
    return this;
  }

  atSite(siteId: string): this {
    this.properties = { ...this.properties, siteId };
    return this;
  }

  /** Lundi de la semaine (`2026-11-16`). */
  forWeekOf(weekStartsOn: string): this {
    this.properties = {
      ...this.properties,
      weekStartsOn: Temporal.PlainDate.from(weekStartsOn),
    };
    return this;
  }

  /** `requiredCount` personnes requises le jour `date`, sur ce créneau et ce poste. */
  needing(requiredCount: number, date: string, shiftTemplateId: string, positionId: string): this {
    const need = {
      date: Temporal.PlainDate.from(date),
      shiftTemplateId,
      positionId,
      requiredCount,
    };
    this.properties = { ...this.properties, needs: [...this.properties.needs, need] };
    return this;
  }

  build(): WeeklyCoverage {
    return WeeklyCoverage.create(this.properties);
  }
}

export function aWeeklyCoverage(): WeeklyCoverageBuilder {
  return new WeeklyCoverageBuilder();
}
