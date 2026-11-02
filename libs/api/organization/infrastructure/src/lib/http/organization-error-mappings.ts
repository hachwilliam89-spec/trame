import { ShiftTemplateNotFoundError, SiteNotFoundError } from '@trame/api/organization/application';
import {
  BlankShiftTemplateLabelError,
  BlankSiteNameError,
  BreakOutsideShiftError,
  EmptyShiftError,
  InvalidBreakDurationError,
  InvalidSiteCodeError,
  SiteCodeAlreadyUsedError,
  UnknownTimeZoneError,
} from '@trame/api/organization/domain';
import type { ErrorMapping } from '@trame/platform/problem-details';
import { problemTypes } from '@trame/shared/contracts';

/**
 * Réponse HTTP de chaque erreur du contexte. Un test vérifie que toute erreur du domaine figure
 * ici : une erreur oubliée deviendrait un 500.
 */
export const organizationErrorMappings: ErrorMapping[] = [
  { error: SiteNotFoundError, status: 404 },
  { error: ShiftTemplateNotFoundError, status: 404 },
  {
    error: SiteCodeAlreadyUsedError,
    status: 409,
    type: problemTypes.siteCodeAlreadyUsed,
    title: 'Code de site déjà utilisé',
  },
  // Erreurs de champ : rendues comme une erreur de validation du contrat (400 avec `errors`).
  { error: InvalidSiteCodeError, pointer: '#/code', code: 'invalid_site_code' },
  { error: BlankSiteNameError, pointer: '#/name', code: 'blank' },
  { error: UnknownTimeZoneError, pointer: '#/timeZone', code: 'unknown_time_zone' },
  { error: BlankShiftTemplateLabelError, pointer: '#/label', code: 'blank' },
  { error: EmptyShiftError, pointer: '#/endTime', code: 'empty_shift' },
  {
    error: InvalidBreakDurationError,
    pointer: '#/break/durationMinutes',
    code: 'invalid_break_duration',
  },
  { error: BreakOutsideShiftError, pointer: '#/break', code: 'break_outside_shift' },
];
