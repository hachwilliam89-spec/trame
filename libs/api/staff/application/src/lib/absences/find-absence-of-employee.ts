import type { Absence } from '@trame/api/staff/domain';
import { AbsenceNotFoundError } from '../not-found.errors';
import type { AbsenceRepository } from '../ports/absence.repository';

/**
 * Charge l'absence désignée par son employé, dans l'organisation, ou lève `AbsenceNotFoundError`.
 * Une absence d'un autre employé est introuvable par ce chemin, comme celle d'une autre
 * organisation (AGENTS.md, règle 9).
 */
export async function findAbsenceOfEmployee(
  absences: AbsenceRepository,
  organizationId: string,
  employeeId: string,
  absenceId: string,
): Promise<Absence> {
  const absence = await absences.findById(organizationId, absenceId);
  if (absence?.employeeId !== employeeId) {
    throw new AbsenceNotFoundError();
  }
  return absence;
}
