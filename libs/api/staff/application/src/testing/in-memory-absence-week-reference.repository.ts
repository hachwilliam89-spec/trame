import { type AbsenceWeekReference, EqualShareReference } from '@trame/api/staff/domain';
import type { AbsenceWeekReferenceRepository } from '../lib/ports/absence-week-reference.repository';
import type { InMemoryEmployeeRepository } from './in-memory-employee.repository';

/** Dépôt en mémoire, pour les tests. Le site d'une référence est celui de son employé. */
export class InMemoryAbsenceWeekReferenceRepository implements AbsenceWeekReferenceRepository {
  private readonly references = new Map<string, AbsenceWeekReference>();

  constructor(private readonly employees: InMemoryEmployeeRepository) {}

  /** Garde la référence déjà figée pour ce salarié et cette semaine, comme la base. */
  addIfAbsent(reference: AbsenceWeekReference): void {
    const key = keyOf(reference.organizationId, reference.employeeId, reference.weekStartsOn);
    if (!this.references.has(key)) {
      this.references.set(key, reference);
    }
  }

  async find(
    organizationId: string,
    employeeId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<AbsenceWeekReference | undefined> {
    return this.references.get(keyOf(organizationId, employeeId, weekStartsOn));
  }

  async listBySite(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<AbsenceWeekReference[]> {
    const matching: AbsenceWeekReference[] = [];
    for (const reference of this.references.values()) {
      if (
        reference.organizationId !== organizationId ||
        !reference.weekStartsOn.equals(weekStartsOn)
      ) {
        continue;
      }
      const employee = await this.employees.findById(organizationId, reference.employeeId);
      if (employee?.siteId === siteId) {
        matching.push(reference);
      }
    }
    return matching;
  }

  async saveDayValuation(
    reference: EqualShareReference,
    day: Temporal.PlainDate,
  ): Promise<boolean> {
    const valuation = reference.dayValuations.get(day.toString());
    if (valuation === undefined) {
      throw new RangeError(`La référence ne donne aucune durée au ${day.toString()}.`);
    }
    const key = keyOf(reference.organizationId, reference.employeeId, reference.weekStartsOn);
    const stored = this.references.get(key);
    if (!(stored instanceof EqualShareReference)) {
      return false;
    }
    // Comme la base : seule la durée de ce jour change, les autres restent celles enregistrées.
    const dayValuations = new Map(stored.dayValuations);
    dayValuations.set(day.toString(), valuation);
    this.references.set(key, EqualShareReference.freeze({ ...stored, dayValuations }));
    return true;
  }
}

function keyOf(
  organizationId: string,
  employeeId: string,
  weekStartsOn: Temporal.PlainDate,
): string {
  return `${organizationId}/${employeeId}/${weekStartsOn.toString()}`;
}
