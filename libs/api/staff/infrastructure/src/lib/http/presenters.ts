import type { EmployeeAbsenceValuation } from '@trame/api/staff/application';
import {
  type Absence,
  type AbsenceWeekReference,
  type Contract,
  type Employee,
  EqualShareReference,
  PlanningReference,
  type Qualification,
} from '@trame/api/staff/domain';
import type {
  AbsenceV1,
  AbsenceWeekReferenceV1,
  EmployeeAbsenceValuationV1,
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

export function toEmployeeAbsenceValuationV1(
  employeeValuation: EmployeeAbsenceValuation,
): EmployeeAbsenceValuationV1 {
  const { valuation } = employeeValuation;
  const reference =
    employeeValuation.reference === undefined
      ? null
      : toAbsenceWeekReferenceV1(employeeValuation.reference);
  if (valuation.status === 'VALUED') {
    return {
      employeeId: employeeValuation.employeeId,
      reference,
      status: 'VALUED',
      absenceMinutes: valuation.absenceMinutes,
      daysToDefine: [],
    };
  }
  return {
    employeeId: employeeValuation.employeeId,
    reference,
    status: 'TO_DEFINE',
    absenceMinutes: null,
    daysToDefine: valuation.daysToDefine.map((day) => day.toString()),
  };
}

function toAbsenceWeekReferenceV1(reference: AbsenceWeekReference): AbsenceWeekReferenceV1 {
  if (reference instanceof PlanningReference) {
    return {
      method: 'REFERENCE_PLANNING',
      frozenAt: reference.frozenAt.toString(),
      generationId: reference.generationId,
    };
  }
  if (reference instanceof EqualShareReference) {
    return {
      method: 'EQUAL_SHARE_OF_ACTIVITY_DAYS',
      frozenAt: reference.frozenAt.toString(),
      weeklyMinimumMinutes: reference.weeklyMinimumMinutes,
      activityDays: reference.activityDays.map((day) => day.toString()),
      dailyShareMinutes: reference.dailyShareMinutes,
      dayValuations: Object.fromEntries(reference.dayValuations),
    };
  }
  throw new TypeError(`Méthode de valorisation inconnue : ${reference.method}.`);
}
