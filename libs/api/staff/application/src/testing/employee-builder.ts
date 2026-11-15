import { Employee, type EmployeeProperties } from '@trame/api/staff/domain';

/**
 * Monteur de données de test (US-031). Un scénario ne nomme que ce qui compte pour lui :
 * `anEmployee().atSite(siteId).qualifiedFor(cacesId, '2026-12-09').build()`.
 */
export class EmployeeBuilder {
  private properties: EmployeeProperties = {
    id: '0190f0a0-0000-7000-8000-0000000000e1',
    organizationId: '0190f0a0-0000-7000-8000-00000000000a',
    siteId: '0190f0a0-0000-7000-8000-0000000000d1',
    firstName: 'Camille',
    lastName: 'Martin',
    qualifications: [],
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

  atSite(siteId: string): this {
    this.properties = { ...this.properties, siteId };
    return this;
  }

  named(firstName: string, lastName: string): this {
    this.properties = { ...this.properties, firstName, lastName };
    return this;
  }

  /** `expiresOn` est le dernier jour de validité (`2026-12-09`). Absent : sans date d'expiration. */
  qualifiedFor(skillId: string, expiresOn?: string): this {
    const qualification = {
      skillId,
      expiresOn: expiresOn === undefined ? undefined : Temporal.PlainDate.from(expiresOn),
    };
    this.properties = {
      ...this.properties,
      qualifications: [...this.properties.qualifications, qualification],
    };
    return this;
  }

  build(): Employee {
    return Employee.create(this.properties);
  }
}

export function anEmployee(): EmployeeBuilder {
  return new EmployeeBuilder();
}
