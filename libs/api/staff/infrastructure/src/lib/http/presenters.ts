import type { Employee, Qualification } from '@trame/api/staff/domain';
import type { EmployeeQualificationV1, EmployeeV1 } from '@trame/shared/contracts';

/** Conversion des objets du domaine vers les contrats de l'API (`@trame/shared/contracts`). */

export function toEmployeeV1(employee: Employee): EmployeeV1 {
  return {
    id: employee.id,
    siteId: employee.siteId,
    firstName: employee.firstName,
    lastName: employee.lastName,
    qualifications: employee.qualifications.map(toEmployeeQualificationV1),
    createdAt: employee.createdAt.toString(),
  };
}

function toEmployeeQualificationV1(qualification: Qualification): EmployeeQualificationV1 {
  if (qualification.expiresOn === undefined) {
    return { skillId: qualification.skillId, expiresOn: null };
  }
  return { skillId: qualification.skillId, expiresOn: qualification.expiresOn.toString() };
}
