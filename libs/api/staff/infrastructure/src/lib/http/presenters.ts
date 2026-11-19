import type { Absence, Contract, Employee, Qualification } from '@trame/api/staff/domain';
import type {
  AbsenceV1,
  EmployeeQualificationV1,
  EmployeeV1,
  EmploymentContractV1,
} from '@trame/shared/contracts';

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

export function toEmploymentContractV1(contract: Contract): EmploymentContractV1 {
  return {
    id: contract.id,
    employeeId: contract.employeeId,
    weeklyMinutesMin: contract.weeklyMinutesMin,
    weeklyMinutesMax: contract.weeklyMinutesMax,
    startsOn: contract.startsOn.toString(),
    endsOn: contract.endsOn === undefined ? null : contract.endsOn.toString(),
    createdAt: contract.createdAt.toString(),
  };
}

export function toAbsenceV1(absence: Absence): AbsenceV1 {
  return {
    id: absence.id,
    employeeId: absence.employeeId,
    startsAt: absence.startsAt.toString(),
    endsAt: absence.endsAt.toString(),
    reason: absence.reason,
    createdAt: absence.createdAt.toString(),
  };
}
