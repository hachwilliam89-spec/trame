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
  type ValuationMethod,
  valueAbsencesOfWeek,
} from './lib/absence/absence-week-reference';
export {
  type DayValuation,
  EqualShareReference,
  type EqualShareReferenceProperties,
  type ValuedDay,
} from './lib/absence/equal-share-reference';
export {
  PlanningReference,
  type PlanningReferenceProperties,
  type WorkedShift,
} from './lib/absence/planning-reference';
export { type InstantInterval } from './lib/absence/instant-interval';
export {
  AbsenceEndNotOnWholeMinuteError,
  AbsenceStartNotOnWholeMinuteError,
  InvalidAbsencePeriodError,
  InvalidAbsenceReasonError,
  InvalidDayValuationError,
  InvalidWeekStartError,
  NoPartialAbsenceOnDayError,
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
