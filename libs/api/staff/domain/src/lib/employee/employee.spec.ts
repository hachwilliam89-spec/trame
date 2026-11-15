import { Employee, type EmployeeProperties } from './employee';
import {
  DuplicateQualificationError,
  InvalidEmployeeFirstNameError,
  InvalidEmployeeLastNameError,
} from './employee.errors';

const CACES_CATEGORY_3 = '0190f0a0-0000-7000-8000-0000000000c3';
const CACES_CATEGORY_5 = '0190f0a0-0000-7000-8000-0000000000c5';

function employeeProperties(overrides: Partial<EmployeeProperties> = {}): EmployeeProperties {
  return {
    id: '0190f0a0-0000-7000-8000-0000000000e1',
    organizationId: '0190f0a0-0000-7000-8000-00000000000a',
    siteId: '0190f0a0-0000-7000-8000-0000000000d1',
    firstName: 'Camille',
    lastName: 'Martin',
    qualifications: [],
    createdAt: Temporal.Instant.from('2026-11-15T08:00:00Z'),
    ...overrides,
  };
}

describe('Employee', () => {
  it('garde ses habilitations, avec ou sans date d’expiration', () => {
    const employee = Employee.create(
      employeeProperties({
        qualifications: [
          { skillId: CACES_CATEGORY_3, expiresOn: Temporal.PlainDate.from('2026-12-09') },
          { skillId: CACES_CATEGORY_5, expiresOn: undefined },
        ],
      }),
    );

    expect(employee.qualifications).toHaveLength(2);
    expect(employee.qualifications[0]?.skillId).toBe(CACES_CATEGORY_3);
    expect(employee.qualifications[0]?.expiresOn?.toString()).toBe('2026-12-09');
    expect(employee.qualifications[1]?.expiresOn).toBeUndefined();
  });

  it('trie les habilitations par compétence : leur ordre n’a pas de sens métier', () => {
    const employee = Employee.create(
      employeeProperties({
        qualifications: [
          { skillId: CACES_CATEGORY_5, expiresOn: undefined },
          { skillId: CACES_CATEGORY_3, expiresOn: undefined },
        ],
      }),
    );

    const skillIds = employee.qualifications.map((qualification) => qualification.skillId);
    expect(skillIds).toEqual([CACES_CATEGORY_3, CACES_CATEGORY_5]);
  });

  it('refuse deux habilitations pour la même compétence, même avec des UUID de casses différentes', () => {
    const duplicated = employeeProperties({
      qualifications: [
        { skillId: CACES_CATEGORY_3, expiresOn: undefined },
        {
          skillId: CACES_CATEGORY_3.toUpperCase(),
          expiresOn: Temporal.PlainDate.from('2027-01-01'),
        },
      ],
    });

    expect(() => Employee.create(duplicated)).toThrow(DuplicateQualificationError);
  });

  it.each(['', '   ', 'a'.repeat(101)])('refuse le prénom invalide %j', (firstName) => {
    expect(() => Employee.create(employeeProperties({ firstName }))).toThrow(
      InvalidEmployeeFirstNameError,
    );
  });

  it.each(['', '   ', 'a'.repeat(101)])('refuse le nom invalide %j', (lastName) => {
    expect(() => Employee.create(employeeProperties({ lastName }))).toThrow(
      InvalidEmployeeLastNameError,
    );
  });

  it('accepte un nom de 100 caractères', () => {
    const employee = Employee.create(employeeProperties({ lastName: 'a'.repeat(100) }));

    expect(employee.lastName).toHaveLength(100);
  });

  it('ne laisse pas modifier ses habilitations après sa création', () => {
    const employee = Employee.create(
      employeeProperties({ qualifications: [{ skillId: CACES_CATEGORY_3, expiresOn: undefined }] }),
    );

    expect(Object.isFrozen(employee.qualifications)).toBe(true);
  });
});
