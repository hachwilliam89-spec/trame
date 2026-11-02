/**
 * Demande d'une page, en pagination par curseur (ADR-0021).
 * Les éléments sont triés par identifiant croissant : les UUID v7 suivent l'ordre de création.
 */
export interface PageRequest {
  /** Nombre maximal d'éléments renvoyés. */
  limit: number;
  /** Identifiant du dernier élément de la page précédente. Absent : première page. */
  after?: string;
}

/** Page de résultats. `nextCursor` vaut `null` sur la dernière page. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Construit une page à partir d'éléments lus avec un de plus que la limite.
 * Cet élément en trop indique qu'une page suivante existe, sans requête de comptage.
 */
export function pageFrom<T extends { id: string }>(rowsWithOneExtra: T[], limit: number): Page<T> {
  const items = rowsWithOneExtra.slice(0, limit);
  const hasNextPage = rowsWithOneExtra.length > limit;
  const lastItem = items.at(-1);

  if (!hasNextPage || lastItem === undefined) {
    return { items, nextCursor: null };
  }
  return { items, nextCursor: lastItem.id };
}

/** Applique une demande de page à des éléments déjà en mémoire (dépôts de test). */
export function pageOfSorted<T extends { id: string }>(
  sortedById: T[],
  request: PageRequest,
): Page<T> {
  const after = request.after;
  const remaining = after === undefined ? sortedById : sortedById.filter((item) => item.id > after);
  return pageFrom(remaining.slice(0, request.limit + 1), request.limit);
}
