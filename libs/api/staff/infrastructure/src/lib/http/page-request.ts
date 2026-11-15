import type { PageRequest } from '@trame/platform/pagination';
import type { PageQueryV1 } from '@trame/shared/contracts';

/** Le curseur reçu est l'identifiant du dernier élément de la page précédente. */
export function toPageRequest(query: PageQueryV1): PageRequest {
  return { limit: query.limit, after: query.cursor };
}
