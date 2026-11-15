import { z } from 'zod';

/** Besoin de couverture : le nombre de personnes requises un jour, sur un créneau type et un poste. */
export const coverageNeedV1 = z.object({
  /** Jour du créneau, dans le calendrier du site (`2026-11-21`). */
  date: z.iso.date(),
  shiftTemplateId: z.uuid(),
  positionId: z.uuid(),
  requiredCount: z.int().min(1),
});

export type CoverageNeedV1 = z.infer<typeof coverageNeedV1>;

/** Besoins de couverture d'un site pour une semaine, du lundi au dimanche. */
export const weeklyCoverageV1 = z.object({
  siteId: z.uuid(),
  /** Lundi de la semaine (`2026-11-16`). */
  weekStartsOn: z.iso.date(),
  /** Triés par jour, créneau type et poste. Vide si la semaine n'a aucun besoin. */
  needs: z.array(coverageNeedV1),
  /** Instant de la dernière définition. `null` : aucun besoin n'a jamais été défini pour cette semaine. */
  updatedAt: z.iso.datetime().nullable(),
});

export type WeeklyCoverageV1 = z.infer<typeof weeklyCoverageV1>;

/** Paramètres de `GET /api/v1/coverage-needs` : le site et le lundi de la semaine. */
export const weeklyCoverageQueryV1 = z.object({
  siteId: z.uuid(),
  weekStartsOn: z.iso.date(),
});

export type WeeklyCoverageQueryV1 = z.infer<typeof weeklyCoverageQueryV1>;
