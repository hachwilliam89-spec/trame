import type { Actor } from '@trame/platform/auth';

export const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
export const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';

/** Utilisateurs de test : un par rôle dans l'organisation A, et un admin de l'organisation B. */
export const testActors = {
  adminOfA: {
    userId: '0190f0a0-0000-7000-8000-0000000000a1',
    organizationId: ORGANIZATION_A,
    roles: ['admin'],
  },
  managerOfA: {
    userId: '0190f0a0-0000-7000-8000-0000000000a2',
    organizationId: ORGANIZATION_A,
    roles: ['manager'],
  },
  employeeOfA: {
    userId: '0190f0a0-0000-7000-8000-0000000000a3',
    organizationId: ORGANIZATION_A,
    roles: ['employee'],
  },
  adminOfB: {
    userId: '0190f0a0-0000-7000-8000-0000000000b1',
    organizationId: ORGANIZATION_B,
    roles: ['admin'],
  },
} satisfies Record<string, Actor>;
