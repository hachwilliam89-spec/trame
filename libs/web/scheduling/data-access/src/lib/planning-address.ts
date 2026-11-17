/** Le site et la semaine que l'adresse `/planning?site=…&semaine=…` demande, après validation. */
export interface PlanningAddress {
  siteId: string;
  weekStartsOn: string;
}

/** Clé de `sessionStorage` : le site et la semaine à rouvrir au retour de la connexion. */
export const PLANNING_RETURN_KEY = 'trame.retour-planning';

const PLANNING_PATH = '/planning';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONDAY = 1;

type ReturnStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Un UUID de site et une date ISO qui tombe un lundi ; toute autre forme est refusée. */
export function readPlanningAddress(
  site: string | null,
  week: string | null,
): PlanningAddress | undefined {
  if (site === null || week === null || !UUID.test(site) || !isMonday(week)) return undefined;
  return { siteId: site.toLowerCase(), weekStartsOn: week };
}

/**
 * Avant la connexion : retient le site et la semaine de la page, rien d'autre. Keycloak revient
 * toujours sur `/oidc-callback`, qui perdrait sinon l'adresse demandée.
 */
export function rememberPlanningReturn(
  storage: ReturnStorage,
  pathname: string,
  search: string,
): void {
  const query = new URLSearchParams(search);
  const address =
    pathname === PLANNING_PATH
      ? readPlanningAddress(query.get('site'), query.get('semaine'))
      : undefined;
  if (address === undefined) {
    storage.removeItem(PLANNING_RETURN_KEY);
    return;
  }
  storage.setItem(PLANNING_RETURN_KEY, JSON.stringify(address));
}

/** Au retour de la connexion : l'adresse interne du planning retenu, sinon l'accueil. */
export function planningReturnAddress(storage: ReturnStorage): string {
  const stored = storage.getItem(PLANNING_RETURN_KEY);
  storage.removeItem(PLANNING_RETURN_KEY);
  const address = parseStoredAddress(stored);
  if (address === undefined) return '/';
  const query = new URLSearchParams({ site: address.siteId, semaine: address.weekStartsOn });
  return `${PLANNING_PATH}?${query.toString()}`;
}

/** La valeur stockée est revalidée : elle ne sert jamais telle quelle à construire l'adresse. */
function parseStoredAddress(stored: string | null): PlanningAddress | undefined {
  if (stored === null) return undefined;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== 'object' || value === null) return undefined;
    const { siteId, weekStartsOn } = value as Record<string, unknown>;
    if (typeof siteId !== 'string' || typeof weekStartsOn !== 'string') return undefined;
    return readPlanningAddress(siteId, weekStartsOn);
  } catch {
    return undefined;
  }
}

function isMonday(isoDate: string): boolean {
  const parts = ISO_DATE.exec(isoDate);
  if (parts === null) return false;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // Une date impossible (30 février) est décalée par `Date.UTC` : le jour ne correspond plus.
  return (
    date.getUTCDate() === day && date.getUTCMonth() === month - 1 && date.getUTCDay() === MONDAY
  );
}
