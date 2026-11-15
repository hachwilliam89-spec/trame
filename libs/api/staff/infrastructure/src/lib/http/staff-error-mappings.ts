import {
  EmployeeNotFoundError,
  SiteNotFoundError,
  SkillNotFoundError,
} from '@trame/api/staff/application';
import {
  DuplicateQualificationError,
  InvalidEmployeeFirstNameError,
  InvalidEmployeeLastNameError,
} from '@trame/api/staff/domain';
import type { ErrorMapping } from '@trame/platform/problem-details';

/**
 * Réponse HTTP de chaque erreur du contexte. Un test vérifie que toute erreur du domaine et de
 * l'application figure ici : une erreur oubliée deviendrait un 500.
 */
export const staffErrorMappings: ErrorMapping[] = [
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
];
