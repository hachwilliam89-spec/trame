/** Une réponse reçue par le navigateur pendant un parcours. */
export interface ObservedRequest {
  host: string;
  status: number;
  /** Instant de la réponse sur une horloge monotone, en millisecondes. */
  atMilliseconds: number;
}

export interface HostRequests {
  requests: number;
  /** Le plus grand nombre de requêtes reçues en moins d'une seconde. */
  peakPerSecond: number;
  /** Requêtes refusées par la limite de débit (HTTP 429). */
  throttled: number;
}

const TOO_MANY_REQUESTS = 429;
const WINDOW_MILLISECONDS = 1_000;

/**
 * Les requêtes d'un parcours réel, par hôte : leur nombre, leur pic sur une seconde et celles que
 * la limite de débit a refusées. C'est la mesure qui règle les limites de Traefik.
 */
export class RequestTally {
  private readonly instantsByHost = new Map<string, number[]>();
  private readonly throttledByHost = new Map<string, number>();

  record(request: ObservedRequest): void {
    const instants = this.instantsByHost.get(request.host) ?? [];
    instants.push(request.atMilliseconds);
    this.instantsByHost.set(request.host, instants);
    if (request.status === TOO_MANY_REQUESTS) {
      this.throttledByHost.set(request.host, (this.throttledByHost.get(request.host) ?? 0) + 1);
    }
  }

  /** La mesure de chaque hôte, par nom trié. */
  byHost(): Record<string, HostRequests> {
    const result: Record<string, HostRequests> = {};
    for (const host of [...this.instantsByHost.keys()].sort()) {
      const instants = this.instantsByHost.get(host) ?? [];
      result[host] = {
        requests: instants.length,
        peakPerSecond: peakInOneSecond(instants),
        throttled: this.throttledByHost.get(host) ?? 0,
      };
    }
    return result;
  }

  throttledRequests(): number {
    let total = 0;
    for (const throttled of this.throttledByHost.values()) {
      total += throttled;
    }
    return total;
  }
}

/** Fenêtre glissante : pour chaque requête, celles qui la précèdent de moins d'une seconde. */
function peakInOneSecond(instants: number[]): number {
  const sorted = [...instants].sort((first, second) => first - second);
  let peak = 0;
  let windowStart = 0;
  for (let windowEnd = 0; windowEnd < sorted.length; windowEnd += 1) {
    while ((sorted[windowEnd] ?? 0) - (sorted[windowStart] ?? 0) >= WINDOW_MILLISECONDS) {
      windowStart += 1;
    }
    peak = Math.max(peak, windowEnd - windowStart + 1);
  }
  return peak;
}
