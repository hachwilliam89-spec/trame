import { z } from 'zod';

const MINUTES_PER_DAY = 24 * 60;

/**
 * Durée valorisée d'un jour couvert en partie par une absence, pour une semaine sans planning de
 * référence : `PUT /api/v1/employees/{employeeId}/absence-days/{date}` (US-033). Au plus la part
 * journalière de la convention des parts égales.
 */
export const absenceDayValuationRequestV1 = z.strictObject({
  valuedMinutes: z.int().min(0).max(MINUTES_PER_DAY),
});

export type AbsenceDayValuationRequestV1 = z.infer<typeof absenceDayValuationRequestV1>;

/** Jour du chemin de `PUT …/absence-days/{date}`. */
export const absenceDayPathV1 = z.object({ date: z.iso.date() });

export type AbsenceDayPathV1 = z.infer<typeof absenceDayPathV1>;

/** Référence figée sur le dernier planning réussi de la semaine, à la première absence. */
const referencePlanningV1 = z.object({
  method: z.literal('REFERENCE_PLANNING'),
  frozenAt: z.iso.datetime(),
  generationId: z.uuid(),
});

/**
 * Convention de démonstration « parts égales sur les jours d'activité », figée avec ses
 * paramètres pour expliquer le calcul. Ni règle de paie, ni décompte légal des absences.
 */
const equalShareOfActivityDaysV1 = z.object({
  method: z.literal('EQUAL_SHARE_OF_ACTIVITY_DAYS'),
  frozenAt: z.iso.datetime(),
  weeklyMinimumMinutes: z.int().min(0),
  activityDays: z.array(z.iso.date()),
  /** Minimum divisé par le nombre de jours d'activité, éventuellement non entier. */
  dailyShareMinutes: z.number().min(0),
  /** Durées données par le manager pour des jours couverts en partie. */
  dayValuations: z.record(z.iso.date(), z.int().min(0)),
});

export const absenceWeekReferenceV1 = z.discriminatedUnion('method', [
  referencePlanningV1,
  equalShareOfActivityDaysV1,
]);

export type AbsenceWeekReferenceV1 = z.infer<typeof absenceWeekReferenceV1>;

/** Valorisation des absences d'un employé sur la semaine : le minimum restant en découle. */
export const employeeAbsenceValuationV1 = z.object({
  employeeId: z.uuid(),
  /** `null` : aucune référence figée, la valorisation reste à définir. */
  reference: absenceWeekReferenceV1.nullable(),
  status: z.enum(['VALUED', 'TO_DEFINE']),
  /** Minutes d'absence valorisées ; `null` tant que la valorisation est à définir. */
  absenceMinutes: z.int().min(0).nullable(),
  /** Jours couverts en partie dont la durée reste à donner. */
  daysToDefine: z.array(z.iso.date()),
});

export type EmployeeAbsenceValuationV1 = z.infer<typeof employeeAbsenceValuationV1>;

/**
 * Valorisation des absences des employés d'un site sur une semaine :
 * `GET /api/v1/absence-valuations?siteId=…&weekStartsOn=…`. Seuls les employés absents dans la
 * semaine y figurent, triés par identifiant.
 */
export const weekAbsenceValuationsV1 = z.object({
  siteId: z.uuid(),
  weekStartsOn: z.iso.date(),
  valuations: z.array(employeeAbsenceValuationV1),
});

export type WeekAbsenceValuationsV1 = z.infer<typeof weekAbsenceValuationsV1>;
