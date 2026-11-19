import {
  AbsenceNotFoundError,
  EmployeeNotFoundError,
  NoEqualShareReferenceError,
  SiteNotFoundError,
  SkillNotFoundError,
} from '@trame/api/staff/application';
import {
  AbsenceEndNotOnWholeMinuteError,
  AbsenceStartNotOnWholeMinuteError,
  DuplicateQualificationError,
  InvalidAbsencePeriodError,
  InvalidAbsenceReasonError,
  InvalidContractPeriodError,
  InvalidDayValuationError,
  InvalidEmployeeFirstNameError,
  InvalidEmployeeLastNameError,
  InvalidWeeklyVolumeError,
  InvalidWeekStartError,
  NoPartialAbsenceOnDayError,
  NotAnActivityDayError,
  OverlappingContractError,
} from '@trame/api/staff/domain';
import type { ErrorMapping } from '@trame/platform/problem-details';

/**
 * Réponse HTTP de chaque erreur du contexte. Un test vérifie que toute erreur du domaine et de
 * l'application figure ici : une erreur oubliée deviendrait un 500.
 */
export const staffErrorMappings: ErrorMapping[] = [
  { error: AbsenceNotFoundError, status: 404 },
  { error: NoEqualShareReferenceError, status: 409 },
  { error: EmployeeNotFoundError, status: 404 },
  { error: SiteNotFoundError, status: 404 },
  { error: SkillNotFoundError, status: 404 },
  // Erreurs de champ : rendues comme une erreur de validation du contrat (400 avec `errors`).
  { error: InvalidEmployeeFirstNameError, pointer: '#/firstName', code: 'invalid_first_name' },
  { error: InvalidEmployeeLastNameError, pointer: '#/lastName', code: 'invalid_last_name' },
  {
    error: DuplicateQualificationError,
    pointer: '#/qualifications',
    code: 'duplicate_qualification',
  },
  {
    error: InvalidWeeklyVolumeError,
    pointer: '#/weeklyMinutesMax',
    code: 'invalid_weekly_volume',
  },
  { error: InvalidContractPeriodError, pointer: '#/endsOn', code: 'invalid_contract_period' },
  { error: OverlappingContractError, pointer: '#/startsOn', code: 'overlapping_contract' },
  { error: AbsenceStartNotOnWholeMinuteError, pointer: '#/startsAt', code: 'not_on_whole_minute' },
  { error: AbsenceEndNotOnWholeMinuteError, pointer: '#/endsAt', code: 'not_on_whole_minute' },
  { error: InvalidAbsencePeriodError, pointer: '#/endsAt', code: 'invalid_absence_period' },
  { error: InvalidAbsenceReasonError, pointer: '#/reason', code: 'invalid_absence_reason' },
  { error: InvalidWeekStartError, pointer: '#/weekStartsOn', code: 'invalid_week_start' },
  { error: InvalidDayValuationError, pointer: '#/valuedMinutes', code: 'invalid_day_valuation' },
  { error: NotAnActivityDayError, pointer: '#/date', code: 'not_an_activity_day' },
  { error: NoPartialAbsenceOnDayError, pointer: '#/date', code: 'no_partial_absence' },
];
