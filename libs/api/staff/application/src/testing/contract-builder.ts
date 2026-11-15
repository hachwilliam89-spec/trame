import { Contract, type ContractProperties } from '@trame/api/staff/domain';

const MINUTES_PER_HOUR = 60;

/**
 * Monteur de données de test (US-032). Par défaut : le contrat de l'employé de `anEmployee()`,
 * de 28 à 35 h par semaine, sans date de fin.
 * `aContract().ofEmployee(employeeId).weeklyHours(14, 21).from('2026-07-01').build()`.
 */
export class ContractBuilder {
  private properties: ContractProperties = {
    id: '0190f0a0-0000-7000-8000-0000000000f1',
    organizationId: '0190f0a0-0000-7000-8000-00000000000a',
    employeeId: '0190f0a0-0000-7000-8000-0000000000e1',
    weeklyMinutesMin: 28 * MINUTES_PER_HOUR,
    weeklyMinutesMax: 35 * MINUTES_PER_HOUR,
    startsOn: Temporal.PlainDate.from('2026-01-01'),
    endsOn: undefined,
    createdAt: Temporal.Instant.from('2026-11-15T08:00:00Z'),
  };

  withId(id: string): this {
    this.properties = { ...this.properties, id };
    return this;
  }

  inOrganization(organizationId: string): this {
    this.properties = { ...this.properties, organizationId };
    return this;
  }

  ofEmployee(employeeId: string): this {
    this.properties = { ...this.properties, employeeId };
    return this;
  }

  weeklyHours(minimum: number, maximum: number): this {
    this.properties = {
      ...this.properties,
      weeklyMinutesMin: minimum * MINUTES_PER_HOUR,
      weeklyMinutesMax: maximum * MINUTES_PER_HOUR,
    };
    return this;
  }

  /** Premier jour du contrat (`2026-07-01`). */
  from(startsOn: string): this {
    this.properties = { ...this.properties, startsOn: Temporal.PlainDate.from(startsOn) };
    return this;
  }

  /** Dernier jour du contrat, inclus (`2026-12-31`). */
  until(endsOn: string): this {
    this.properties = { ...this.properties, endsOn: Temporal.PlainDate.from(endsOn) };
    return this;
  }

  build(): Contract {
    return Contract.create(this.properties);
  }
}

export function aContract(): ContractBuilder {
  return new ContractBuilder();
}
