import { z } from 'zod';
import { pageOfV1 } from '../common/page.v1';
import { requiredText } from '../common/text.v1';

/** Heure locale du site, à la minute : `22:00`. */
const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Pause d'un créneau : son heure de début, en heure locale du site, et sa durée. */
const shiftBreak = z.object({
  startTime: localTime,
  durationMinutes: z.int().min(1).max(1439),
});

/**
 * Création d'un créneau type : `POST /api/v1/sites/{siteId}/shift-templates`.
 * Les heures sont locales au site. Une fin plus tôt que le début signifie le lendemain (nuit 22 h–6 h).
 */
export const createShiftTemplateRequestV1 = z.object({
  label: requiredText(50),
  startTime: localTime,
  endTime: localTime,
  /** Règle métier (US-030) : un créneau type a toujours une pause positionnée. */
  break: shiftBreak,
});

export type CreateShiftTemplateRequestV1 = z.infer<typeof createShiftTemplateRequestV1>;

/** Un créneau type, tel que l'API le renvoie. */
export const shiftTemplateV1 = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  label: z.string(),
  startTime: localTime,
  endTime: localTime,
  break: shiftBreak,
  /** Vrai si le créneau finit le lendemain de son début. */
  crossesMidnight: z.boolean(),
  createdAt: z.iso.datetime(),
});

export type ShiftTemplateV1 = z.infer<typeof shiftTemplateV1>;

/** Liste des créneaux types d'un site : `GET /api/v1/sites/{siteId}/shift-templates`. */
export const shiftTemplatePageV1 = pageOfV1(shiftTemplateV1);

export type ShiftTemplatePageV1 = z.infer<typeof shiftTemplatePageV1>;

/** Date de début du créneau, en query string de `GET …/shift-templates/{id}/durations`. */
export const shiftDurationsQueryV1 = z.object({
  date: z.iso.date(),
});

export type ShiftDurationsQueryV1 = z.infer<typeof shiftDurationsQueryV1>;

/**
 * Durées réelles d'un créneau commencé à une date donnée, dans le fuseau du site.
 * Elles tiennent compte des changements d'heure : la nuit 22 h–6 h dure 9 h au passage à l'heure d'hiver.
 * Une heure locale désigne le premier instant où l'horloge du site l'affiche ; une heure sautée
 * au passage à l'heure d'été désigne l'instant du saut.
 */
export const shiftDurationsV1 = z.object({
  date: z.iso.date(),
  /** Instants UTC de début et de fin (ADR-0019). */
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  /** Temps écoulé entre le début et la fin. */
  amplitudeMinutes: z.int(),
  /** Partie de la pause qui tombe pendant le créneau. */
  breakMinutes: z.int(),
  /** Amplitude moins la pause. */
  effectiveMinutes: z.int(),
});

export type ShiftDurationsV1 = z.infer<typeof shiftDurationsV1>;
