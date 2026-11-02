import { z } from 'zod';

/**
 * Paramètres de pagination par curseur, en query string (ADR-0021).
 * `limit` arrive en texte dans l'URL : `z.coerce` le convertit en nombre.
 */
export const pageQueryV1 = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Valeur de `nextCursor` de la page précédente. Absent : première page. */
  cursor: z.uuid().optional(),
});

export type PageQueryV1 = z.infer<typeof pageQueryV1>;

/** Page de résultats : `nextCursor` vaut `null` sur la dernière page. */
export function pageOfV1<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    items: z.array(item),
    nextCursor: z.uuid().nullable(),
  });
}
