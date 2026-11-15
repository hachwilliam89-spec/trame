import {
  PositionNotFoundError,
  ShiftTemplateNotFoundError,
  SiteNotFoundError,
} from '@trame/api/demand/application';
import {
  DuplicateCoverageNeedError,
  InvalidRequiredCountError,
  InvalidWeekStartError,
  NeedOutsideWeekError,
} from '@trame/api/demand/domain';
import type { ErrorMapping } from '@trame/platform/problem-details';

/**
 * Réponse HTTP de chaque erreur du contexte. Un test vérifie que toute erreur du domaine et de
 * l'application figure ici : une erreur oubliée deviendrait un 500.
 */
export const demandErrorMappings: ErrorMapping[] = [
  { error: SiteNotFoundError, status: 404 },
  { error: ShiftTemplateNotFoundError, status: 404 },
  { error: PositionNotFoundError, status: 404 },
  // Erreurs de champ : rendues comme une erreur de validation du contrat (400 avec `errors`).
  { error: InvalidWeekStartError, pointer: '#/weekStartsOn', code: 'invalid_week_start' },
  { error: NeedOutsideWeekError, pointer: '#/needs', code: 'need_outside_week' },
  { error: InvalidRequiredCountError, pointer: '#/needs', code: 'invalid_required_count' },
  { error: DuplicateCoverageNeedError, pointer: '#/needs', code: 'duplicate_coverage_need' },
];
