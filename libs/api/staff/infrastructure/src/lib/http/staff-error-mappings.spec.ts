import * as staffApplication from '@trame/api/staff/application';
import * as staffDomain from '@trame/api/staff/domain';
import { DomainError } from '@trame/api/staff/domain';
import type { ErrorClass } from '@trame/platform/problem-details';
import { staffErrorMappings } from './staff-error-mappings';

/** Vrai pour une classe qui hérite d'`Error`. */
function isErrorClass(value: unknown): value is ErrorClass {
  return typeof value === 'function' && value.prototype instanceof Error;
}

/** Classes d'erreur exportées par un module. */
function errorClassesOf(moduleExports: Record<string, unknown>): ErrorClass[] {
  return Object.values(moduleExports).filter(isErrorClass);
}

describe('staffErrorMappings', () => {
  const mappedErrors = staffErrorMappings.map((mapping) => mapping.error);

  it("traduit chaque erreur du domaine et de l'application : aucune ne finit en 500", () => {
    const errorClasses = [
      ...errorClassesOf(staffDomain),
      ...errorClassesOf(staffApplication),
    ].filter((errorClass) => errorClass !== DomainError);

    expect(errorClasses.length).toBeGreaterThan(0);
    for (const errorClass of errorClasses) {
      expect(mappedErrors, errorClass.name).toContain(errorClass);
    }
  });
});
