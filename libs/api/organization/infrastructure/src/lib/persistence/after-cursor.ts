/** Filtre sur l'identifiant pour lire la page suivante. Sans curseur (première page), aucun filtre. */
export function afterCursor(after: string | undefined): { gt: string } | undefined {
  if (after === undefined) {
    return undefined;
  }
  return { gt: after };
}
