import * as demandApplication from '@trame/api/demand/application';
import * as demandDomain from '@trame/api/demand/domain';
import { DomainError } from '@trame/api/demand/domain';
import type { ErrorClass } from '@trame/platform/problem-details';
import { demandErrorMappings } from './demand-error-mappings';

/** Vrai pour une classe qui hérite d'`Error`. */
function isErrorClass(value: unknown): value is ErrorClass {
  return typeof value === 'function' && value.prototype instanceof Error;
}

/** Classes d'erreur exportées par un module. */
function errorClassesOf(moduleExports: Record<string, unknown>): ErrorClass[] {
  return Object.values(moduleExports).filter(isErrorClass);
}

describe('demandErrorMappings', () => {
  const mappedErrors = demandErrorMappings.map((mapping) => mapping.error);

  it("traduit chaque erreur du domaine et de l'application : aucune ne finit en 500", () => {
    const errorClasses = [
      ...errorClassesOf(demandDomain),
      ...errorClassesOf(demandApplication),
    ].filter((errorClass) => errorClass !== DomainError);

    expect(errorClasses.length).toBeGreaterThan(0);
    for (const errorClass of errorClasses) {
      expect(mappedErrors, errorClass.name).toContain(errorClass);
    }
  });
});
