import { z } from 'zod';

/**
 * Motif d'une absence, par catégorie : congé, arrêt de travail, formation, autre (US-033). Aucun
 * champ libre ne l'accompagne : une absence ne porte jamais de détail médical.
 */
export const absenceReasonV1 = z.enum(['LEAVE', 'SICK_LEAVE', 'TRAINING', 'OTHER']);

export type AbsenceReasonV1 = z.infer<typeof absenceReasonV1>;

/** Secondes à zéro, juste avant le décalage : `…T06:00:00+01:00` ou `…T05:00:00Z`. */
const ZERO_SECONDS = /:00(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Instant d'une absence, à la minute : secondes à zéro et sans fraction (`2026-11-24T06:00:00+01:00`).
 * C'est la précision des créneaux, et celle des minutes d'absence que le moteur comptera. Elle tient
 * dans le stockage, à la milliseconde : rien n'est tronqué entre la réponse et la relecture.
 */
const ABSENCE_INSTANT_FORMAT =
  'Instant ISO 8601 avec décalage, à la minute : secondes à 00, sans fraction (2026-11-24T06:00:00+01:00).';

/** Un seul message par champ : le format est vérifié d'abord, les secondes ensuite. */
const absenceInstantV1 = z.iso
  .datetime({ offset: true, precision: 0, error: ABSENCE_INSTANT_FORMAT, abort: true })
  .regex(ZERO_SECONDS, ABSENCE_INSTANT_FORMAT);

/**
 * Déclaration ou modification d'une absence : `POST /api/v1/employees/{employeeId}/absences`, et
 * `PUT /api/v1/employees/{employeeId}/absences/{absenceId}`. Les instants portent leur décalage et
 * tombent sur une minute entière : l'API les stocke en UTC, et ils se lisent dans le fuseau du site
 * (ADR-0019). Tout autre champ est refusé.
 */
export const absenceRequestV1 = z.strictObject({
  /** Début de l'absence (`2026-11-24T00:00:00+01:00`). */
  startsAt: absenceInstantV1,
  /** Fin de l'absence, exclue : une journée entière d'absence finit à minuit le lendemain. */
  endsAt: absenceInstantV1,
  reason: absenceReasonV1,
});

export type AbsenceRequestV1 = z.infer<typeof absenceRequestV1>;

/** Une absence, telle que l'API la renvoie. Ses instants sont en UTC. */
export const absenceV1 = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  startsAt: z.iso.datetime(),
  /** Fin de l'absence, exclue. */
  endsAt: z.iso.datetime(),
  reason: absenceReasonV1,
  createdAt: z.iso.datetime(),
});

export type AbsenceV1 = z.infer<typeof absenceV1>;

/** Paramètres de `GET /api/v1/absences` : le site et le lundi de la semaine. */
export const weekAbsencesQueryV1 = z.object({
  siteId: z.uuid(),
  weekStartsOn: z.iso.date(),
});

export type WeekAbsencesQueryV1 = z.infer<typeof weekAbsencesQueryV1>;

/**
 * Absences des employés d'un site qui touchent une semaine : du lundi 0 h au lundi suivant 0 h,
 * à l'heure du site. Triées par début, puis par identifiant.
 */
export const weekAbsencesV1 = z.object({
  siteId: z.uuid(),
  /** Lundi de la semaine (`2026-11-23`). */
  weekStartsOn: z.iso.date(),
  absences: z.array(absenceV1),
});

export type WeekAbsencesV1 = z.infer<typeof weekAbsencesV1>;
