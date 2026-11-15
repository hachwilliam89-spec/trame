import {
  DuplicateQualificationError,
  InvalidEmployeeFirstNameError,
  InvalidEmployeeLastNameError,
} from './employee.errors';
import type { Qualification } from './qualification';

/** Longueur maximale d'un prénom ou d'un nom. */
const PERSON_NAME_MAX_LENGTH = 100;

export interface EmployeeProperties {
  id: string;
  organizationId: string;
  siteId: string;
  firstName: string;
  lastName: string;
  qualifications: readonly Qualification[];
  createdAt: Temporal.Instant;
}

/**
 * Employé d'une organisation, rattaché à un site. Ses habilitations forment un ensemble sans
 * ordre métier, avec une seule habilitation par compétence.
 */
export class Employee {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly qualifications: readonly Qualification[];
  readonly createdAt: Temporal.Instant;

  private constructor(properties: EmployeeProperties) {
    this.id = properties.id;
    this.organizationId = properties.organizationId;
    this.siteId = properties.siteId;
    this.firstName = properties.firstName;
    this.lastName = properties.lastName;
    this.qualifications = Object.freeze([...properties.qualifications]);
    this.createdAt = properties.createdAt;
  }

  static create(properties: EmployeeProperties): Employee {
    if (!isValidPersonName(properties.firstName)) {
      throw new InvalidEmployeeFirstNameError();
    }
    if (!isValidPersonName(properties.lastName)) {
      throw new InvalidEmployeeLastNameError();
    }
    const qualifications = normalizeQualifications(properties.qualifications);
    return new Employee({ ...properties, qualifications });
  }
}

/** Un prénom ou un nom a au moins un caractère visible, et 100 caractères au plus. */
function isValidPersonName(name: string): boolean {
  return name.trim() !== '' && name.length <= PERSON_NAME_MAX_LENGTH;
}

function normalizeQualifications(qualifications: readonly Qualification[]): Qualification[] {
  // PostgreSQL compare les UUID sans tenir compte de la casse. Le domaine fait de même.
  const normalized = qualifications.map((qualification) => ({
    skillId: qualification.skillId.toLowerCase(),
    expiresOn: qualification.expiresOn,
  }));
  const distinctSkillIds = new Set(normalized.map((qualification) => qualification.skillId));
  if (distinctSkillIds.size !== normalized.length) {
    throw new DuplicateQualificationError();
  }
  return normalized.toSorted(compareBySkillId);
}

function compareBySkillId(left: Qualification, right: Qualification): number {
  if (left.skillId < right.skillId) {
    return -1;
  }
  if (left.skillId > right.skillId) {
    return 1;
  }
  return 0;
}
