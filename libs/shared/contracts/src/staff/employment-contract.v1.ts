import { z } from 'zod';
import { pageOfV1 } from '../common/page.v1';

/**
 * Contrat de travail d'un employé, tel que l'API le renvoie. Le nom `employmentContract` le
 * distingue des contrats d'échange de cette bibliothèque.
 */
export const employmentContractV1 = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  /** Volume hebdomadaire minimum, en minutes. */
  weeklyMinutesMin: z.int().min(0),
  /** Volume hebdomadaire maximum, en minutes. */
  weeklyMinutesMax: z.int().min(1),
  /** Premier jour du contrat (`2026-01-01`). */
  startsOn: z.iso.date(),
  /** Dernier jour du contrat, inclus. `null` : le contrat n'a pas de date de fin. */
  endsOn: z.iso.date().nullable(),
  createdAt: z.iso.datetime(),
});

export type EmploymentContractV1 = z.infer<typeof employmentContractV1>;

/** Contrats d'un employé : `GET /api/v1/employees/:employeeId/contracts`. */
export const employmentContractPageV1 = pageOfV1(employmentContractV1);

export type EmploymentContractPageV1 = z.infer<typeof employmentContractPageV1>;
