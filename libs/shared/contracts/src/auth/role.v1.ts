import { z } from 'zod';

/**
 * Rôles portés par le jeton d'identité (Keycloak, US-020).
 * - `admin` : admin RH, décrit l'organisation (sites, créneaux, compétences, contrats).
 * - `manager` : manager de site, définit les besoins et ajuste les plannings.
 * - `employee` : consulte son planning.
 */
export const roleV1 = z.enum(['admin', 'manager', 'employee']);

export type RoleV1 = z.infer<typeof roleV1>;
