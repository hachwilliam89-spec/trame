import * as organizationApplication from '@trame/api/organization/application';
import * as organizationDomain from '@trame/api/organization/domain';
import { DomainError } from '@trame/api/organization/domain';
import type { ErrorClass } from '@trame/platform/problem-details';
import { organizationErrorMappings } from './organization-error-mappings';

/** Vrai pour une classe qui hérite d'`Error`. */
function isErrorClass(value: unknown): value is ErrorClass {
  return typeof value === 'function' && value.prototype instanceof Error;
}

/** Classes d'erreur exportées par un module. */
function errorClassesOf(moduleExports: Record<string, unknown>): ErrorClass[] {
  return Object.values(moduleExports).filter(isErrorClass);
}

describe('organizationErrorMappings', () => {
  const mappedErrors = organizationErrorMappings.map((mapping) => mapping.error);

  it("traduit chaque erreur du domaine et de l'application : aucune ne finit en 500", () => {
    const errorClasses = [
      ...errorClassesOf(organizationDomain),
      ...errorClassesOf(organizationApplication),
    ].filter((errorClass) => errorClass !== DomainError);

    expect(errorClasses.length).toBeGreaterThan(0);
    for (const errorClass of errorClasses) {
      expect(mappedErrors, errorClass.name).toContain(errorClass);
    }
  });
});
