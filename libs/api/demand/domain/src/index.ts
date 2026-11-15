export { DomainError } from './lib/domain-error';
export type { CoverageNeed } from './lib/weekly-coverage/coverage-need';
export {
  WeeklyCoverage,
  type WeeklyCoverageProperties,
  ensureWeekStartsOnMonday,
} from './lib/weekly-coverage/weekly-coverage';
export {
  DuplicateCoverageNeedError,
  InvalidRequiredCountError,
  InvalidWeekStartError,
  NeedOutsideWeekError,
} from './lib/weekly-coverage/weekly-coverage.errors';
