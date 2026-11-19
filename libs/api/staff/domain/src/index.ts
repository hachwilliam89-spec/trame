export {
  ABSENCE_REASONS,
  Absence,
  type AbsencePeriod,
  type AbsenceProperties,
  type AbsenceReason,
} from './lib/absence/absence';
export { type WeekBounds, weekBounds, weeksTouchedBy } from './lib/absence/absence-week';
export {
  type AbsenceValuation,
  type AbsenceWeekReference,
  EqualShareReference,
  type EqualShareReferenceProperties,
  PlanningReference,
  type PlanningReferenceProperties,
  type ValuationMethod,
  type WorkedShift,
  valueAbsencesOfWeek,
} from './lib/absence/absence-week-reference';
export { type InstantInterval } from './lib/absence/instant-interval';
export {
  AbsenceEndNotOnWholeMinuteError,
  AbsenceStartNotOnWholeMinuteError,
  InvalidAbsencePeriodError,
  InvalidAbsenceReasonError,
  InvalidDayValuationError,
  InvalidWeekStartError,
  NotAnActivityDayError,
} from './lib/absence/absence.errors';
export {
  Contract,
  type ContractProperties,
  ensureNoOverlappingContract,
} from './lib/contract/contract';
export {
  InvalidContractPeriodError,
  InvalidWeeklyVolumeError,
  OverlappingContractError,
} from './lib/contract/contract.errors';
export { DomainError } from './lib/domain-error';
export { Employee, type EmployeeProperties } from './lib/employee/employee';
export {
  DuplicateQualificationError,
  InvalidEmployeeFirstNameError,
  InvalidEmployeeLastNameError,
} from './lib/employee/employee.errors';
export type { Qualification } from './lib/employee/qualification';
