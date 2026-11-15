import { z } from 'zod';
import { pageOfV1, pageQueryV1 } from '../common/page.v1';

/** Habilitation d'un employé : une compétence du catalogue de son organisation. */
export const employeeQualificationV1 = z.object({
  skillId: z.uuid(),
  /** Dernier jour de validité, inclus (`2026-12-09`). `null` : l'habilitation n'expire pas. */
  expiresOn: z.iso.date().nullable(),
});

export type EmployeeQualificationV1 = z.infer<typeof employeeQualificationV1>;

/** Un employé, tel que l'API le renvoie. Ses habilitations sont triées : leur ordre n'a pas de sens métier. */
export const employeeV1 = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  qualifications: z.array(employeeQualificationV1),
  createdAt: z.iso.datetime(),
});

export type EmployeeV1 = z.infer<typeof employeeV1>;

/** Paramètres de `GET /api/v1/employees` : le site est obligatoire, la pagination se fait par curseur. */
export const employeeListQueryV1 = pageQueryV1.extend({
  siteId: z.uuid(),
});

export type EmployeeListQueryV1 = z.infer<typeof employeeListQueryV1>;

/** Employés d'un site : `GET /api/v1/employees?siteId=…`. */
export const employeePageV1 = pageOfV1(employeeV1);

export type EmployeePageV1 = z.infer<typeof employeePageV1>;
